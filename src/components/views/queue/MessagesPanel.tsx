import { useCallback, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ArrowRightLeft, Ban, Check, Download, Eye, Funnel, Play, Reply, Rows3, Send, Trash2, Waves } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import type { Column } from "@/components/data/DataTable";
import { DataTable } from "@/components/data/DataTable";
import { EmptyState, Notice } from "@/components/data/parts";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { bytes, dateTime, int } from "@/lib/rabbit/format";
import { confirmDestructive, isReadOnly } from "@/lib/rabbit/guard";
import { paths } from "@/lib/rabbit/paths";
import { api } from "@/lib/tauri";
import { confirm } from "@/store/confirmStore";
import { useConnectionsStore } from "@/store/connectionsStore";
import { openDialog } from "@/store/dialogStore";
import type { Message, Queue, StreamOffset, TransferTarget } from "@/types/rabbit";
import { cn } from "@/lib/utils";
import { MessageInspector, type MessageActions } from "./MessageInspector";
import { TransferProgress } from "./TransferProgress";
import { parseFilter } from "./lib/filter";
import { exportShape, fingerprints, preview, secondsToMs, toRow, type Row } from "./lib/messages";
import { hasAmqp, refreshQueues, useTransfer } from "./lib/transfer";

type Mode = "peek" | "ack" | "reject";
type OffsetKind = StreamOffset["kind"];

interface Result {
  rows: Row[];
  ms: number;
  mode: Mode | "stream";
}

const MAX = 500;

const field =
  "flex h-[30px] min-w-0 items-center gap-2 rounded-md border border-field-line bg-field px-2 focus-within:border-accent";
const fieldLabel = "shrink-0 font-sans text-xs text-fg-3";
const fieldInput =
  "min-w-0 flex-1 bg-transparent font-data text-fg outline-none placeholder:font-sans placeholder:text-sm placeholder:text-fg-3";

/** Headers a republish shouldn't carry over: the old dead-letter trail. */
function cleanHeaders(h: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(h).filter(([k]) => k !== "x-death" && !k.startsWith("x-first-death") && !k.startsWith("x-last-death")));
}

/**
 * Reading messages: peek (requeue), get (ack, removes) or reject (dead-
 * letters), filtered client-side by the `where` language; streams are read
 * by offset over AMQP instead. Chosen messages can be replayed, moved,
 * deleted, republished or exported.
 */
export default function MessagesPanel({
  cid,
  vhost,
  name,
  queue,
  focus,
  onSawDeaths,
}: {
  cid: string;
  vhost: string;
  name: string;
  queue: Queue | undefined;
  focus: string | null;
  onSawDeaths: () => void;
}) {
  const stream = queue?.type === "stream";
  const quorum = queue?.type === "quorum";
  const readOnly = isReadOnly(cid);
  const amqp = hasAmqp(cid);
  const [mode, setMode] = useState<Mode>("peek");
  const [where, setWhere] = useState("");
  const [count, setCount] = useState("50");
  const [offsetKind, setOffsetKind] = useState<OffsetKind>("first");
  const [offsetValue, setOffsetValue] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<string | null>(null);
  /** The row to scroll to after a read (the tab's focus, else the first). */
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const readId = useRef<string | null>(null);
  const transfer = useTransfer(cid);

  const filter = useMemo(() => parseFilter(where), [where]);
  const shown = useMemo(() => {
    if (!result) return [];
    return filter.ok ? result.rows.filter((r) => filter.test(r.record)) : result.rows;
  }, [result, filter]);
  const hasDeaths = useMemo(() => shown.some((r) => r.deaths.length > 0), [shown]);
  const n = Math.max(1, Math.min(MAX, Math.floor(Number(count) || 50)));

  const writeReason = readOnly
    ? "This connection is read-only"
    : stream
      ? "Stream messages stay in the log; republish a copy instead"
      : !amqp
        ? "Moving or deleting chosen messages needs AMQP, which is off for this connection"
        : undefined;
  const canWrite = !writeReason;

  const take = useCallback(
    (messages: Message[], ms: number, m: Result["mode"]) => {
      const rows = messages.map(toRow);
      setResult({ rows, ms, mode: m });
      setSelected(new Set());
      setCurrent(null);
      if (rows.some((r) => r.deaths.length)) onSawDeaths();
      if (rows.length) {
        const want = focus ? rows.find((r) => r.msg.fingerprint === focus) : rows[0];
        if (want) {
          setSelected(new Set([want.key]));
          setCurrent(want.key);
          setRevealKey(want.key);
        }
      }
    },
    [focus, onSawDeaths],
  );

  const get = useCallback(async () => {
    if (loading) return;
    setError(null);
    const t0 = performance.now();
    try {
      if (stream) {
        if (!amqp) return;
        const offset: StreamOffset =
          offsetKind === "offset"
            ? { kind: "offset", value: Math.floor(Number(offsetValue) || 0) }
            : offsetKind === "timestamp"
              ? { kind: "timestamp", value: Math.floor((Date.parse(offsetValue) || Date.now()) / 1000) }
              : { kind: offsetKind };
        const id = crypto.randomUUID();
        readId.current = id;
        setLoading(true);
        const list = await api.readStream(rabbit(cid).sessionId(), id, vhost, name, offset, n);
        take(list, performance.now() - t0, "stream");
        return;
      }
      if (mode !== "peek") {
        const ok = await confirmDestructive(cid, {
          title: mode === "ack" ? `Take ${n} messages from ${name}?` : `Reject ${n} messages of ${name}?`,
          message:
            (mode === "ack"
              ? "Get (ack) removes every message it reads from the queue."
              : "Reject reads messages and rejects them without requeue: they go to the queue's dead-letter exchange, or are dropped when it has none.") +
            (where.trim() ? " The filter only narrows what is shown; every fetched message is affected." : ""),
          confirmLabel: mode === "ack" ? "Get and remove" : "Reject",
        });
        if (!ok) return;
      }
      setLoading(true);
      let list: Message[];
      if (mode === "reject") {
        // The management API's own reject: basic.reject without requeue, so
        // the broker dead-letters. Nothing to pick later, so no fingerprints.
        const raw = await rabbit(cid).post<Message[]>(`${paths.queue(vhost, name)}/get`, {
          count: n,
          ackmode: "reject_requeue_false",
          encoding: "auto",
          truncate: 50000,
        });
        list = raw.map((m) => ({ ...m, fingerprint: m.fingerprint ?? "" }));
      } else {
        list = await api.getMessages(rabbit(cid).sessionId(), vhost, name, n, mode === "peek");
      }
      take(list, performance.now() - t0, mode);
      if (mode !== "peek") refreshQueues(cid);
    } catch (e) {
      setError(errorText(e));
    } finally {
      readId.current = null;
      setLoading(false);
    }
  }, [loading, stream, amqp, offsetKind, offsetValue, cid, vhost, name, n, take, mode, where]);

  const selectedRows = useMemo(() => shown.filter((r) => selected.has(r.key)), [shown, selected]);
  const currentRow = useMemo(
    () => shown.find((r) => r.key === current) ?? (selectedRows.length ? selectedRows[0] : null),
    [shown, current, selectedRows],
  );

  /** Moves or deletes chosen rows over AMQP, then drops them from the list. */
  const transferRows = useCallback(
    async (rows: Row[], target: TransferTarget, label: string, verb: string) => {
      const select = fingerprints(rows);
      if (!select.length) return;
      const s = await transfer.run({ vhost, queue: name, target, select, limit: null }, label, verb);
      if (s && s.done > 0 && !s.failed && !s.missing) {
        const gone = new Set(rows.map((r) => r.key));
        setResult((r) => (r ? { ...r, rows: r.rows.filter((x) => !gone.has(x.key)) } : r));
        setSelected(new Set());
        setCurrent(null);
      }
    },
    [transfer, vhost, name],
  );

  const replay = useCallback(
    async (rows: Row[]) => {
      // Replaying loses nothing, but on a guarded (production) connection it
      // feeds live consumers again, so it asks first - without a typed name.
      const profile = useConnectionsStore.getState().profiles.find((p) => p.id === cid);
      if (profile?.typedConfirmation) {
        const ok = await confirm({
          title: rows.length === 1 ? "Replay this message?" : `Replay ${rows.length} messages?`,
          message: `${rows.length === 1 ? "It is" : "They are"} published again where ${rows.length === 1 ? "it was" : "they were"} first sent (from x-death) on ${profile.name}, and taken off ${name} once the broker confirms. Live consumers will process ${rows.length === 1 ? "it" : "them"}.`,
          confirmLabel: rows.length === 1 ? "Replay message" : `Replay ${rows.length} messages`,
        });
        if (!ok) return;
      }
      await transferRows(rows, { kind: "origin" }, rows.length === 1 ? "Replayed to origin" : `Replayed ${rows.length} messages`, "replayed");
    },
    [cid, name, transferRows],
  );
  const discard = useCallback(
    async (rows: Row[]) => {
      const ok = await confirmDestructive(cid, {
        title: rows.length === 1 ? "Delete this message?" : `Delete ${rows.length} messages?`,
        message: `${rows.length === 1 ? "The message is" : "They are"} taken off ${name} and acknowledged, so the broker forgets ${rows.length === 1 ? "it" : "them"}. This cannot be undone.`,
        confirmLabel: rows.length === 1 ? "Delete message" : `Delete ${rows.length} messages`,
      });
      if (ok) await transferRows(rows, { kind: "discard" }, rows.length === 1 ? "Message deleted" : `Deleted ${rows.length} messages`, "deleted");
    },
    [cid, name, transferRows],
  );
  const move = useCallback(
    (rows: Row[]) => openDialog("move-messages", { connectionId: cid, vhost, name, data: { select: fingerprints(rows) } }),
    [cid, vhost, name],
  );
  const exportRows = useCallback(
    async (rows: Row[]) => {
      try {
        const path = await save({
          defaultPath: `${name}-messages.json`,
          filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (!path) return;
        await api.writeTextFile(path, JSON.stringify(exportShape(rows), null, 2));
        toast.success(`Exported ${rows.length} ${rows.length === 1 ? "message" : "messages"}`, { description: path });
      } catch (e) {
        toast.error("Export failed", { description: errorText(e) });
      }
    },
    [name],
  );

  const actions = useMemo<MessageActions>(
    () => ({
      copy: (row) => {
        const text = row.json !== undefined ? JSON.stringify(row.json, null, 2) : row.binary ? row.msg.payload : row.text;
        void navigator.clipboard.writeText(text).then(
          () => toast.success("Payload copied", { description: row.props.message_id ?? undefined }),
          (e) => toast.error("Copy failed", { description: errorText(e) }),
        );
      },
      replay: (row) => void replay([row]),
      move: (row) => move([row]),
      discard: (row) => void discard([row]),
      republish: (row) =>
        openDialog("publish", {
          connectionId: cid,
          vhost,
          data: {
            exchange: row.msg.exchange,
            routingKey: row.msg.routing_key,
            payload: row.json !== undefined ? JSON.stringify(row.json, null, 2) : row.text,
            properties: { ...row.props, headers: cleanHeaders(row.headers) },
          },
        }),
    }),
    [cid, vhost, replay, move, discard],
  );

  const columns = useMemo<Column<Row>[]>(() => {
    const cols: Column<Row>[] = [
      stream
        ? {
            id: "offset",
            header: "offset",
            width: 80,
            align: "right",
            cell: (r) => <span className="text-json-number">{int(r.msg.offset)}</span>,
            sortValue: (r) => r.msg.offset ?? 0,
          }
        : { id: "n", header: "#", width: 48, align: "right", cell: (r) => <span className="text-fg-3">{r.index + 1}</span>, sortValue: (r) => r.index },
      {
        id: "id",
        header: "message_id",
        width: 170,
        cell: (r) => (r.props.message_id ? <span className="text-json-bson">{r.props.message_id}</span> : <span className="text-fg-3">–</span>),
        sortValue: (r) => r.props.message_id,
      },
      { id: "rk", header: "routing_key", width: 170, cell: (r) => r.msg.routing_key, sortValue: (r) => r.msg.routing_key },
      {
        id: "ex",
        header: "exchange",
        width: 150,
        cell: (r) => (r.msg.exchange ? r.msg.exchange : <span className="text-fg-3">(default)</span>),
        sortValue: (r) => r.msg.exchange,
      },
    ];
    if (hasDeaths) {
      cols.push(
        {
          id: "death",
          header: "x-first-death",
          title: "Queue and reason of the first death",
          width: 230,
          cell: (r) => {
            const d = r.deaths[r.deaths.length - 1];
            return d ? (
              <>
                {d.queue} <span className="text-json-keyword">{d.reason}</span>
              </>
            ) : (
              <span className="text-fg-3">–</span>
            );
          },
          sortValue: (r) => r.deaths[r.deaths.length - 1]?.queue,
        },
        {
          id: "deaths",
          header: "deaths",
          width: 64,
          align: "right",
          cell: (r) => <span className="text-json-number">{r.deaths.reduce((s, d) => s + (d.count ?? 0), 0) || ""}</span>,
          sortValue: (r) => r.deaths.reduce((s, d) => s + (d.count ?? 0), 0),
        },
      );
    }
    cols.push(
      {
        id: "redelivered",
        header: "redelivered",
        width: 92,
        cell: (r) => <span className="text-json-keyword">{String(r.msg.redelivered)}</span>,
        sortValue: (r) => (r.msg.redelivered ? 1 : 0),
      },
      { id: "ctype", header: "content_type", width: 140, cell: (r) => r.props.content_type ?? <span className="text-fg-3">–</span>, sortValue: (r) => r.props.content_type },
      {
        id: "ts",
        header: "timestamp",
        width: 160,
        cell: (r) => <span className="text-json-bson">{dateTime(secondsToMs(r.props.timestamp))}</span>,
        sortValue: (r) => r.props.timestamp ?? 0,
      },
      {
        id: "size",
        header: "size",
        width: 80,
        align: "right",
        cell: (r) => <span className="text-json-number">{bytes(r.msg.payload_bytes)}</span>,
        sortValue: (r) => r.msg.payload_bytes,
      },
      { id: "payload", header: "payload", width: 360, cell: (r) => <span className="text-fg-3">{preview(r)}</span> },
    );
    return cols;
  }, [stream, hasDeaths]);

  const rowKey = useCallback((r: Row) => r.key, []);
  const onSelectionChange = useCallback((keys: Set<string>, last: string | null) => {
    setSelected(keys);
    setCurrent(last);
  }, []);
  const menu = useCallback(
    (row: Row, keys: Set<string>) => {
      const many = keys.size > 1 ? shown.filter((r) => keys.has(r.key)) : [row];
      const lbl = many.length > 1 ? ` ${many.length} messages` : "";
      return [
        { label: "Copy payload", icon: undefined, shortcut: "Ctrl C", onSelect: () => actions.copy(row) },
        { label: "Republish to…", icon: Send, shortcut: "R", onSelect: () => actions.republish(row) },
        { separator: true as const },
        { label: `Replay${lbl} to origin`, icon: Reply, disabled: !canWrite || !many.some((r) => r.deaths.length), onSelect: () => void replay(many) },
        { label: `Move${lbl}…`, icon: ArrowRightLeft, disabled: !canWrite, onSelect: () => move(many) },
        { label: `Export${lbl} as JSON`, icon: Download, onSelect: () => void exportRows(many) },
        { separator: true as const },
        { label: `Delete${lbl}…`, icon: Trash2, danger: true, disabled: !canWrite, onSelect: () => void discard(many) },
      ];
    },
    [shown, actions, canWrite, replay, move, exportRows, discard],
  );

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("input,textarea,select") || !currentRow) return;
    if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      actions.republish(currentRow);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && !window.getSelection()?.toString()) {
      e.preventDefault();
      actions.copy(currentRow);
    }
  }

  const ready = queue?.messages_ready ?? 0;
  const effect =
    result?.mode === "peek" ? "requeued" : result?.mode === "ack" ? "acked and removed" : result?.mode === "reject" ? "rejected" : "read from the log";

  const queryBar = (
    <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-[5px]">
      {stream ? (
        <>
          <SegmentedControl<OffsetKind>
            aria-label="Start offset"
            value={offsetKind}
            onChange={setOffsetKind}
            options={[
              { value: "first", label: "First" },
              { value: "last", label: "Last" },
              { value: "next", label: "Next" },
              { value: "offset", label: "Offset" },
              { value: "timestamp", label: "Time" },
            ]}
          />
          {(offsetKind === "offset" || offsetKind === "timestamp") && (
            <label className={cn(field, "w-52 flex-none")}>
              <span className={fieldLabel}>{offsetKind === "offset" ? "offset" : "from"}</span>
              <input
                className={fieldInput}
                type={offsetKind === "timestamp" ? "datetime-local" : "text"}
                inputMode={offsetKind === "offset" ? "numeric" : undefined}
                value={offsetValue}
                onChange={(e) => setOffsetValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void get()}
                aria-label={offsetKind === "offset" ? "Offset" : "Start time"}
              />
            </label>
          )}
        </>
      ) : (
        <SegmentedControl<Mode>
          aria-label="Ack mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "peek", label: "Peek", icon: <Eye />, title: "Read and requeue: nothing is lost" },
            { value: "ack", label: "Get (ack)", icon: <Check />, title: "Read and remove" },
            { value: "reject", label: "Reject", icon: <Ban />, title: "Read and reject without requeue: dead-letters" },
          ]}
        />
      )}
      <label className={cn(field, "flex-1", !filter.ok && "border-danger")}>
        <span className={fieldLabel}>where</span>
        <input
          className={fieldInput}
          spellCheck={false}
          value={where}
          onChange={(e) => setWhere(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void get();
            if (e.key === "Escape" && where) {
              setWhere("");
              e.stopPropagation();
            }
          }}
          placeholder="routing_key, headers.*, properties.* or payload.*  e.g. payload.amount.value > 100"
          aria-label="Filter"
          aria-invalid={!filter.ok}
        />
      </label>
      <label className={cn(field, "w-[92px] flex-none")}>
        <span className={fieldLabel}>count</span>
        <input
          className={cn(fieldInput, "text-right")}
          inputMode="numeric"
          value={count}
          onChange={(e) => setCount(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={() => setCount(String(n))}
          onKeyDown={(e) => e.key === "Enter" && void get()}
          aria-label="Count"
        />
      </label>
      {loading && stream ? (
        <Button onClick={() => readId.current && void api.cancelTask(readId.current)}>Stop</Button>
      ) : (
        <Button
          variant="primary"
          disabled={loading || (stream && !amqp) || (mode !== "peek" && readOnly)}
          title={mode !== "peek" && readOnly ? "This connection is read-only" : undefined}
          onClick={() => void get()}
        >
          <Play className="size-3.5" />
          {loading ? "Reading…" : stream ? "Read" : "Get"}
        </Button>
      )}
    </div>
  );

  let body;
  if (stream && !amqp) {
    body = (
      <EmptyState icon={Waves} title="Streams are read by offset">
        The management API can't read a stream (basic.get doesn't apply). Turn on AMQP in the connection's settings to read it
        from an offset here.
      </EmptyState>
    );
  } else if (error) {
    body = <Notice tone="crit">{error}</Notice>;
  } else if (!result) {
    body = (
      <EmptyState
        icon={stream ? Waves : Eye}
        title={stream ? `${int(queue?.messages ?? 0)} messages in the log` : ready ? `${int(ready)} messages ready` : "The queue is empty"}
        action={
          ready || stream ? (
            <Button variant="primary" className="mt-1.5" disabled={loading} onClick={() => void get()}>
              <Play className="size-3.5" />
              {stream ? `Read ${n} messages` : `${mode === "peek" ? "Peek" : "Get"} ${Math.min(n, ready)} messages`}
            </Button>
          ) : null
        }
      >
        {stream
          ? "Reading a stream doesn't consume it: pick where to start and how many."
          : ready
            ? "Get reads from the head of the queue. In Peek mode every message goes back with the redelivered flag, so nothing is lost."
            : "Publish a test message to see it here."}
      </EmptyState>
    );
  } else if (!shown.length) {
    body = (
      <EmptyState icon={result.rows.length ? Funnel : Rows3} title={result.rows.length ? "No message matches" : "No messages"}>
        {result.rows.length
          ? `None of the ${result.rows.length} messages read match the filter. Clear it or raise the count.`
          : "Nothing came back from the queue."}
      </EmptyState>
    );
  } else {
    body = (
      <div className="flex min-h-0 flex-1">
        <DataTable
          aria-label="Messages"
          rowNumbers={false}
          rows={shown}
          columns={columns}
          rowKey={rowKey}
          multi
          selected={selected}
          onSelectionChange={onSelectionChange}
          menu={menu}
          reveal={revealKey}
        />
        {currentRow && (
          <MessageInspector
            row={currentRow}
            actions={actions}
            canWrite={canWrite && result.mode === "peek"}
            writeReason={result.mode !== "peek" && !stream ? "These messages were already taken off the queue" : writeReason}
            onClose={() => {
              setSelected(new Set());
              setCurrent(null);
            }}
          />
        )}
      </div>
    );
  }

  const many = selectedRows.length > 1;
  const canPick = canWrite && result?.mode === "peek";
  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      {queryBar}
      {!filter.ok && <Notice tone="crit">{filter.error}</Notice>}
      {quorum && mode === "peek" && !stream && (
        <Notice tone="info">
          Peeking a quorum queue returns each message, which counts toward its delivery limit
          {queue?.delivery_limit != null ? ` (${queue.delivery_limit})` : ""}: peek a message too often and it is dead-lettered or
          dropped.
        </Notice>
      )}
      {!amqp && !stream && result && (
        <Notice tone="info">
          Replaying, moving or deleting chosen messages needs AMQP, which is off for this connection. Move… can still send all
          ready messages to another queue through a one-off shovel.
        </Notice>
      )}
      {transfer.running && <TransferProgress running={transfer.running} onCancel={transfer.cancel} />}
      {result && (
        <div className="flex h-[34px] shrink-0 items-center gap-3 border-b border-line px-3 text-sm text-fg-2">
          <span>
            <b className="font-mono font-medium text-fg tabular-nums">{int(shown.length)}</b>
            {shown.length !== result.rows.length && ` of ${int(result.rows.length)} read`}
            {!stream && ` · ${int(ready)} ready`}
          </span>
          <span className="max-[960px]:hidden">{effect}</span>
          <span className="font-mono text-[12px] tabular-nums max-[960px]:hidden">{Math.round(result.ms)} ms</span>
          <span className="flex-1" />
          {many && (
            <>
              <span className="text-fg-3">{selectedRows.length} selected</span>
              {hasDeaths && (
                <Button size="sm" variant="ghost" disabled={!canPick} title={canPick ? undefined : writeReason} onClick={() => void replay(selectedRows)}>
                  <Reply />
                  Replay
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={!canPick} title={canPick ? undefined : writeReason} onClick={() => move(selectedRows)}>
                <ArrowRightLeft />
                Move…
              </Button>
              <Button size="sm" variant="ghost" className="text-danger" disabled={!canPick} title={canPick ? undefined : writeReason} onClick={() => void discard(selectedRows)}>
                <Trash2 />
                Delete
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" disabled={!shown.length} onClick={() => void exportRows(many ? selectedRows : shown)}>
            <Download />
            {many ? "Export selected" : "Export JSON"}
          </Button>
        </div>
      )}
      {body}
    </div>
  );
}
