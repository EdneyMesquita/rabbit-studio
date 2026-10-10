import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Plus, Waves } from "lucide-react";
import { toast } from "sonner";
import { DataTable, type Column, type SortState } from "@/components/data/DataTable";
import { Inspector } from "@/components/data/Inspector";
import { JsonView } from "@/components/data/JsonView";
import {
  EmptyState,
  ErrorState,
  FilterField,
  KeyValues,
  Loading,
  SectionHeader,
  Spacer,
  StateLabel,
  Tag,
  ViewTitle,
  ViewToolbar,
} from "@/components/data/parts";
import { TimeSeriesChart, samplesOf } from "@/components/charts/TimeSeriesChart";
import type { MenuEntry } from "@/components/common/ActionMenu";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useLive, invalidate } from "@/hooks/useLive";
import { rabbit, errorText } from "@/lib/rabbit/client";
import { confirmDestructive, isReadOnly } from "@/lib/rabbit/guard";
import { bytes, int, shortNode } from "@/lib/rabbit/format";
import { openOn } from "@/lib/rabbit/nav";
import { paths, withQuery } from "@/lib/rabbit/paths";
import { openDialog } from "@/store/dialogStore";
import type { Queue, QueueType } from "@/types/rabbit";
import { queueStatus } from "../problems/issues";
import type { ViewProps } from "../types";
import {
  Pager,
  RateCell,
  ResultsHead,
  ToggleButton,
  Zero,
  connectionIdOf,
  copyText,
  nameQuery,
  useDebounced,
  usePagedList,
} from "./common";

/** Only what the table and inspector show: the list is the cost, so ask for less. */
const COLUMNS = [
  "name",
  "vhost",
  "type",
  "state",
  "durable",
  "auto_delete",
  "exclusive",
  "messages",
  "messages_ready",
  "messages_unacknowledged",
  "consumers",
  "message_stats.publish_details.rate",
  "message_stats.deliver_get_details.rate",
  "message_stats.ack_details.rate",
  "policy",
  "arguments",
  "memory",
  "node",
  "leader",
].join(",");

/** Column id -> the API's sort field; columns not here don't sort. */
const SORT_FIELDS: Record<string, string> = {
  name: "name",
  vhost: "vhost",
  type: "type",
  state: "state",
  ready: "messages_ready",
  unacked: "messages_unacknowledged",
  total: "messages",
  in: "message_stats.publish_details.rate",
  out: "message_stats.deliver_get_details.rate",
  consumers: "consumers",
  node: "node",
  leader: "leader",
  memory: "memory",
};

type TypeFilter = "all" | QueueType;

const keyOf = (q: Queue) => `${q.vhost}\u0000${q.name}`;

/** Argument names the feature tags read; anything else x-* counts as "args". */
const ARG_TAGS: [string, string, string][] = [
  ["x-dead-letter-exchange", "DLX", "dead-letter-exchange"],
  ["x-message-ttl", "TTL", "message-ttl"],
  ["x-expires", "Exp", "expires"],
  ["x-max-length", "Lim", "max-length"],
  ["x-max-length-bytes", "Lim", "max-length-bytes"],
  ["x-single-active-consumer", "SAC", "single-active-consumer"],
];

function Features({ q }: { q: Queue }) {
  const args = q.arguments ?? {};
  const known = new Set(["x-queue-type", ...ARG_TAGS.map((t) => t[0])]);
  const other = Object.keys(args).filter((k) => !known.has(k)).length;
  const seen = new Set<string>();
  const tags: [string, string][] = [];
  if (q.durable) tags.push(["D", "durable"]);
  if (q.auto_delete) tags.push(["AD", "auto-delete"]);
  if (q.exclusive) tags.push(["Excl", "exclusive"]);
  for (const [arg, label, name] of ARG_TAGS) {
    if (args[arg] != null && !seen.has(label)) {
      seen.add(label);
      tags.push([label, `${name}: ${String(args[arg])}`]);
    }
  }
  if (q.policy) tags.push(["Pol", `policy ${q.policy}`]);
  if (other) tags.push([`args ${other}`, "other arguments"]);
  return (
    <span className="inline-flex gap-[3px]">
      {tags.map(([t, title]) => (
        <Tag key={t} title={title}>
          {t}
        </Tag>
      ))}
    </span>
  );
}

function useQueueColumns(allVhosts: boolean, stream: boolean): Column<Queue>[] {
  return useMemo(() => {
    const status: Column<Queue> = {
      id: "state",
      header: "state",
      width: 150,
      mono: false,
      cell: (q) => {
        const s = queueStatus(q);
        return <StateLabel tone={s.tone}>{s.label}</StateLabel>;
      },
    };
    const name: Column<Queue> = { id: "name", header: "name", cell: (q) => q.name };
    const vhost: Column<Queue> = { id: "vhost", header: "vhost", width: 130, cell: (q) => <span className="text-fg-3">{q.vhost}</span> };
    const type: Column<Queue> = { id: "type", header: "type", width: 78, cell: (q) => <span className="text-json-keyword">{q.type ?? "classic"}</span> };
    const features: Column<Queue> = { id: "features", header: "features", width: 170, mono: false, cell: (q) => <Features q={q} /> };
    const ready: Column<Queue> = {
      id: "ready",
      header: "ready",
      align: "right",
      width: 84,
      cell: (q) => (q.type === "stream" ? <span className="text-fg-3">{int(q.messages_ready)}</span> : <Zero n={q.messages_ready} />),
    };
    const unacked: Column<Queue> = { id: "unacked", header: "unacked", align: "right", width: 84, cell: (q) => <Zero n={q.messages_unacknowledged} /> };
    const total: Column<Queue> = { id: "total", header: "total", align: "right", width: 84, cell: (q) => <Zero n={q.messages} /> };
    const inRate: Column<Queue> = { id: "in", header: "in", align: "right", width: 76, cell: (q) => <RateCell rate={q.message_stats?.publish_details?.rate} /> };
    const outRate: Column<Queue> = { id: "out", header: "out", align: "right", width: 76, cell: (q) => <RateCell rate={q.message_stats?.deliver_get_details?.rate} /> };
    const consumers: Column<Queue> = {
      id: "consumers",
      header: "consumers",
      align: "right",
      width: 92,
      cell: (q) => <Zero n={q.consumers} />,
    };
    const node: Column<Queue> = { id: "node", header: "node", width: 150, cell: (q) => <span className="text-fg-3">{shortNode(q.node)}</span> };
    const leader: Column<Queue> = { id: "leader", header: "leader", width: 150, cell: (q) => <span className="text-fg-3">{shortNode(q.leader ?? q.node)}</span> };
    const memory: Column<Queue> = { id: "memory", header: "memory", align: "right", width: 84, cell: (q) => <span className="text-fg-3">{bytes(q.memory)}</span> };

    const cols = stream
      ? [status, name, vhost, total, inRate, outRate, consumers, leader, memory, features]
      : [status, name, vhost, type, ready, unacked, inRate, outRate, consumers, node, features];
    return allVhosts ? cols : cols.filter((c) => c.id !== "vhost");
  }, [allVhosts, stream]);
}

export default function QueuesView({ tab, shown }: ViewProps) {
  const cid = connectionIdOf(tab);
  const stream = tab.kind === "streams";
  const readOnly = isReadOnly(cid);
  const vhost = tab.vhost;

  const [filter, setFilter] = useState("");
  const name = useDebounced(filter);
  const [type, setType] = useState<TypeFilter>(stream ? "stream" : "all");
  const [withMessages, setWithMessages] = useState(false);
  const [noConsumers, setNoConsumers] = useState(false);
  const [page, setPage] = useState(1);
  // Streams sort last by type, so with the type fixed they come first.
  const [sort, setSort] = useState<SortState | null>(stream ? { column: "type", desc: true } : { column: "total", desc: true });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [lastKey, setLastKey] = useState<string | null>(null);

  const sortField = sort ? SORT_FIELDS[sort.column] : undefined;
  const { rows, info, error, fresh, refresh } = usePagedList<Queue>({
    connectionId: cid,
    scope: `queues:${tab.id}`,
    base: paths.queues(vhost),
    page,
    query: { columns: COLUMNS, ...nameQuery(name), sort: sortField, sort_reverse: sortField && sort?.desc ? true : undefined },
    enabled: shown,
  });

  // Type, "with messages" and "without consumers" are not server-side filters: they trim this page.
  const visible = useMemo(
    () =>
      rows.filter(
        (q) =>
          (type === "all" || (q.type ?? "classic") === type) &&
          (!withMessages || (q.messages ?? 0) > 0) &&
          (!noConsumers || (q.consumers ?? 0) === 0),
      ),
    [rows, type, withMessages, noConsumers],
  );
  const trimmed = type !== "all" || withMessages || noConsumers;

  const columns = useQueueColumns(!vhost, stream);

  // A focus passed with the tab ("open on this queue") selects its row once loaded.
  const reveal = useMemo(() => {
    if (!tab.focus) return null;
    const hit = rows.find((q) => q.name === tab.focus && (!vhost || q.vhost === vhost));
    return hit ? keyOf(hit) : null;
  }, [tab.focus, rows, vhost]);

  const current = useMemo(() => {
    const k = lastKey && selected.has(lastKey) ? lastKey : [...selected][0];
    return k ? visible.find((q) => keyOf(q) === k) ?? null : null;
  }, [selected, lastKey, visible]);

  const openQueue = useCallback(
    (q: Queue, view?: string) => openOn(cid, { kind: "queue", vhost: q.vhost, name: q.name, view }),
    [cid],
  );

  const deleteMany = useCallback(
    async (qs: Queue[]) => {
      const ok = await confirmDestructive(cid, {
        title: `Delete ${qs.length} queues`,
        message: `This deletes ${qs.length} queues with their messages: ${qs.slice(0, 5).map((q) => q.name).join(", ")}${qs.length > 5 ? ", ..." : ""}.`,
        confirmLabel: "Delete",
      });
      if (!ok) return;
      let failed = 0;
      for (const q of qs) {
        try {
          await rabbit(cid).del(paths.queue(q.vhost, q.name));
        } catch (e) {
          failed++;
          toast.error(`Could not delete ${q.name}`, { description: errorText(e) });
        }
      }
      if (qs.length - failed) toast.success(`Deleted ${qs.length - failed} queues`);
      setSelected(new Set());
      invalidate(`${cid}:queues`);
    },
    [cid],
  );

  const menu = useCallback(
    (q: Queue, keys: Set<string>): MenuEntry[] => {
      if (keys.size > 1) {
        const picked = rows.filter((r) => keys.has(keyOf(r)));
        return [
          { heading: `${picked.length} queues` },
          { label: "Copy names", onSelect: () => copyText(picked.map((r) => r.name).join("\n"), "Names") },
          { separator: true },
          { label: `Delete ${picked.length} queues…`, danger: true, disabled: readOnly, onSelect: () => void deleteMany(picked) },
        ];
      }
      const isStream = q.type === "stream";
      const ctx = { connectionId: cid, vhost: q.vhost, name: q.name };
      return [
        { heading: q.name },
        { label: "Open", shortcut: "Enter", onSelect: () => openQueue(q) },
        { label: "Open messages", onSelect: () => openQueue(q, "messages") },
        { separator: true },
        { label: "Move messages…", disabled: readOnly || isStream || !q.messages_ready, onSelect: () => openDialog("move-messages", ctx) },
        { label: "Copy name", onSelect: () => copyText(q.name) },
        { separator: true },
        { label: "Purge…", danger: true, disabled: readOnly || isStream || !q.messages_ready, onSelect: () => openDialog("purge-queue", ctx) },
        { label: "Delete queue…", danger: true, disabled: readOnly, onSelect: () => openDialog("delete-queue", ctx) },
      ];
    },
    [cid, rows, readOnly, openQueue, deleteMany],
  );

  const onSortChange = useCallback((next: SortState | null) => {
    // Columns the server can't sort by (features) keep the current order.
    if (next && !SORT_FIELDS[next.column]) return;
    setSort(next);
    setPage(1);
  }, []);

  const noun = stream ? "streams" : "queues";
  useEffect(() => setPage(1), [name, vhost]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <ViewToolbar>
        <ViewTitle icon={stream ? Waves : Inbox} name={stream ? "Streams" : "Queues"} kind={vhost ? `vhost ${vhost}` : "all vhosts"} />
        <FilterField value={filter} onChange={setFilter} placeholder="Filter by name (regex ok)" className="ml-2 w-64" />
        {!stream && (
          <SegmentedControl<TypeFilter>
            aria-label="Queue type"
            value={type}
            onChange={(t) => {
              setType(t);
              // Streams sort last: ask for them first so they fit the page.
              if (t === "stream") setSort({ column: "type", desc: true });
              else if (t === "classic") setSort({ column: "type", desc: false });
              setPage(1);
            }}
            options={[
              { value: "all", label: "All" },
              { value: "classic", label: "classic" },
              { value: "quorum", label: "quorum" },
              { value: "stream", label: "stream" },
            ]}
          />
        )}
        <ToggleButton pressed={withMessages} onToggle={() => setWithMessages((v) => !v)} title="Only queues holding messages on this page">
          With messages
        </ToggleButton>
        <ToggleButton pressed={noConsumers} onToggle={() => setNoConsumers((v) => !v)} title="Only queues without consumers on this page">
          Without consumers
        </ToggleButton>
        <Spacer />
        {!readOnly && (
          <Button variant="primary" onClick={() => openDialog("create-queue", { connectionId: cid, vhost, data: stream ? { type: "stream" } : undefined })}>
            <Plus />
            {stream ? "New stream" : "New queue"}
          </Button>
        )}
      </ViewToolbar>
      <ResultsHead
        count={int(trimmed ? visible.length : info.filtered)}
        noun={noun}
        scope={
          trimmed
            ? `of ${int(rows.length)} on this page`
            : info.filtered !== info.total
              ? `of ${int(info.total)}`
              : vhost
                ? `vhost ${vhost}`
                : undefined
        }
        pager={<Pager page={info.page} pageCount={info.pageCount} onPage={setPage} />}
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {error && !fresh && rows.length === 0 ? (
            <ErrorState error={error} onRetry={() => void refresh()} />
          ) : !fresh && rows.length === 0 ? (
            <Loading />
          ) : (
            <DataTable
              aria-label={noun}
              rows={visible}
              columns={columns}
              rowKey={keyOf}
              multi
              manualSort
              sort={sort}
              onSortChange={onSortChange}
              selected={selected}
              onSelectionChange={(keys, last) => {
                setSelected(keys);
                setLastKey(last);
              }}
              onOpen={(q) => openQueue(q)}
              menu={menu}
              reveal={reveal}
              empty={filter || trimmed ? `No ${noun} match. Clear the filter or the toggles.` : `No ${noun} here yet.`}
            />
          )}
        </div>
        {selected.size > 1 ? (
          <Inspector title={`${selected.size} ${noun} selected`} label="Selection">
            <EmptyState title="Several selected">Right-click for what you can do with all of them.</EmptyState>
          </Inspector>
        ) : current ? (
          <QueueInspector cid={cid} q={current} shown={shown} readOnly={readOnly} onOpen={openQueue} />
        ) : null}
      </div>
    </div>
  );
}

const QueueInspector = memo(function QueueInspector({
  cid,
  q,
  shown,
  readOnly,
  onOpen,
}: {
  cid: string;
  q: Queue;
  shown: boolean;
  readOnly: boolean;
  onOpen: (q: Queue, view?: string) => void;
}) {
  const status = queueStatus(q);
  const isStream = q.type === "stream";
  const ctx = { connectionId: cid, vhost: q.vhost, name: q.name };

  // Samples of the one queue shown, not of the list.
  const path = withQuery(paths.queue(q.vhost, q.name), {
    columns: "messages_ready_details,messages_unacknowledged_details",
    lengths_age: 600,
    lengths_incr: 10,
  });
  const detail = useLive<Pick<Queue, "messages_ready_details" | "messages_unacknowledged_details">>(
    `${cid}:queues:detail:${q.vhost}/${q.name}`,
    () => rabbit(cid).get(path),
    { enabled: shown, interval: 10_000 },
  );
  const series = useMemo(
    () => [
      { label: "Ready", color: "s1" as const, points: samplesOf(detail.data?.messages_ready_details) },
      { label: "Unacked", color: "s2" as const, points: samplesOf(detail.data?.messages_unacknowledged_details) },
    ],
    [detail.data],
  );
  const args = q.arguments ?? {};

  return (
    <Inspector
      label="Queue"
      title={q.name}
      subtitle={`${q.vhost} · ${q.type ?? "classic"}`}
      actions={
        <Button size="sm" onClick={() => onOpen(q)}>
          Open
        </Button>
      }
    >
      <div className="px-3 pt-2 pb-1">
        <StateLabel tone={status.tone}>{status.label}</StateLabel>
      </div>
      {!isStream && (
        <div className="px-3 pb-2">
          <TimeSeriesChart series={series} height={96} format={int} label="Queue depth, last 10 minutes" />
        </div>
      )}
      <KeyValues
        rows={[
          ["ready", int(q.messages_ready)],
          ["unacked", int(q.messages_unacknowledged)],
          ["total", int(q.messages)],
          ["consumers", int(q.consumers)],
          ["publish", <RateCell key="p" rate={q.message_stats?.publish_details?.rate} />],
          ["deliver", <RateCell key="d" rate={q.message_stats?.deliver_get_details?.rate} />],
          ["ack", <RateCell key="a" rate={q.message_stats?.ack_details?.rate} />],
          [isStream ? "leader" : "node", shortNode(q.leader ?? q.node)],
          ["policy", q.policy ?? "–"],
          ["memory", bytes(q.memory)],
        ]}
      />
      {Object.keys(args).length > 0 && (
        <>
          <SectionHeader>Arguments</SectionHeader>
          <div className="px-3 py-2">
            <JsonView value={args} />
          </div>
        </>
      )}
      <SectionHeader>Go to</SectionHeader>
      <div className="flex flex-wrap gap-1.5 px-3 py-2">
        <Button size="sm" variant="secondary" onClick={() => onOpen(q, "messages")}>
          Messages
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onOpen(q, "consumers")}>
          Consumers
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onOpen(q, "bindings")}>
          Bindings
        </Button>
        {!readOnly && !isStream && (
          <Button size="sm" variant="ghost" disabled={!q.messages_ready} onClick={() => openDialog("purge-queue", ctx)}>
            Purge…
          </Button>
        )}
        {!readOnly && (
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => openDialog("delete-queue", ctx)}>
            Delete…
          </Button>
        )}
      </div>
    </Inspector>
  );
});
