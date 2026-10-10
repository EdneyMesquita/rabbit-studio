import { useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Column } from "@/components/data/DataTable";
import { DataTable } from "@/components/data/DataTable";
import { FilterField } from "@/components/data/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useLive } from "@/hooks/useLive";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { int } from "@/lib/rabbit/format";
import { isReadOnly } from "@/lib/rabbit/guard";
import { paths, withQuery } from "@/lib/rabbit/paths";
import type { Page, Queue, TransferInput, TransferSummary, TransferTarget } from "@/types/rabbit";
import type { DialogProps } from "../../types";
import { hasAmqp, shovelAll, summaryText, useTransfer } from "../lib/transfer";

type Kind = "queue" | "exchange" | "origin";
type Amount = "selected" | "all" | "first";
type PickRow = Pick<Queue, "name" | "type" | "messages_ready">;

const label = "mb-1 block text-sm font-medium text-fg-2";

/**
 * Move (or replay) messages of a queue: to another queue of the vhost, to an
 * exchange with a routing key, or back where each one was dead-lettered
 * from. All, the first N, or the messages chosen in the grid
 * (`data.select`: fingerprints). Over AMQP with progress; without AMQP only
 * "all to a queue" works, through a one-off shovel.
 */
export default function MoveMessagesDialog({ context, onClose }: DialogProps) {
  const cid = context.connectionId;
  const vhost = context.vhost ?? "/";
  const source = context.name ?? "";
  const data = context.data ?? {};
  const select = Array.isArray(data.select) ? (data.select as string[]) : null;
  const amqp = hasAmqp(cid);
  const readOnly = isReadOnly(cid);

  const [kind, setKind] = useState<Kind>(
    data.target === "origin" || data.target === "exchange" || data.target === "queue" ? (data.target as Kind) : "queue",
  );
  const [amount, setAmount] = useState<Amount>(select?.length ? "selected" : "all");
  const [first, setFirst] = useState("100");
  const [targetQueue, setTargetQueue] = useState<string>(typeof data.queue === "string" ? data.queue : "");
  const [exchange, setExchange] = useState(typeof data.exchange === "string" ? data.exchange : "");
  const [routingKey, setRoutingKey] = useState(typeof data.routingKey === "string" ? data.routingKey : "");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<TransferSummary | null>(null);
  const transfer = useTransfer(cid);

  const src = useLive<Queue>(`${cid}:queue:${vhost}:${source}:dialog`, () => rabbit(cid).get<Queue>(paths.queue(vhost, source)), {
    interval: 0,
  });
  const ready = src.data?.messages_ready ?? null;

  const term = useDeferredValue(search.trim());
  const picker = useLive<Page<PickRow>>(
    kind === "queue" ? `${cid}:queues:${vhost}:move-picker:${term}` : null,
    () =>
      rabbit(cid).get<Page<PickRow>>(
        withQuery(paths.queues(vhost), {
          columns: "name,type,messages_ready",
          page: 1,
          page_size: 200,
          name: term,
          sort: "name",
        }),
      ),
    { interval: 0 },
  );
  const rows = useMemo(() => (picker.data?.items ?? []).filter((q) => q.name !== source), [picker.data, source]);
  const columns = useMemo<Column<PickRow>[]>(
    () => [
      { id: "name", header: "name", cell: (q) => q.name, sortValue: (q) => q.name },
      { id: "type", header: "type", width: 80, cell: (q) => <span className="text-fg-3">{q.type}</span> },
      {
        id: "ready",
        header: "ready",
        width: 80,
        align: "right",
        cell: (q) => int(q.messages_ready),
        sortValue: (q) => q.messages_ready ?? 0,
      },
    ],
    [],
  );
  const selectedQueue = useMemo(() => new Set(targetQueue ? [targetQueue] : []), [targetQueue]);

  const n = Math.max(1, Math.floor(Number(first) || 0));
  const count = amount === "selected" ? select?.length ?? 0 : amount === "first" ? n : ready;
  const shovelOnly = !amqp;
  const targetOk = kind !== "queue" || !!targetQueue;
  const blocked =
    readOnly ||
    !targetOk ||
    !!transfer.running ||
    (shovelOnly && (kind !== "queue" || amount !== "all")) ||
    (kind === "exchange" && !exchange && !routingKey);

  async function go() {
    if (blocked) return;
    if (shovelOnly) {
      try {
        await shovelAll(cid, vhost, source, targetQueue);
        toast.success("Move started", {
          description: `A one-off shovel moves the ${ready != null ? int(ready) : ""} ready messages of ${source} to ${targetQueue}, then removes itself.`,
        });
        onClose();
      } catch (e) {
        toast.error("Couldn't start the shovel", { description: errorText(e) });
      }
      return;
    }
    const target: TransferTarget =
      kind === "queue" ? { kind: "queue", queue: targetQueue } : kind === "exchange" ? { kind: "exchange", exchange, routingKey } : { kind: "origin" };
    const input: TransferInput = {
      vhost,
      queue: source,
      target,
      select: amount === "selected" ? select : null,
      limit: amount === "first" ? n : null,
    };
    const what = kind === "origin" ? "Replay" : "Move";
    const s = await transfer.run(input, `${what} from ${source}`, kind === "origin" ? "replayed" : "moved");
    if (s) setResult(s);
  }

  const verb = kind === "origin" ? "Replay" : "Move";
  const cta = `${verb} ${count != null ? int(count) : "all"} ${count === 1 ? "message" : "messages"}`;
  const running = transfer.running;
  const pct = running && running.total > 0 ? Math.min(1, running.done / running.total) : 0;

  return (
    <Modal
      title={`${verb} messages from ${source}`}
      onClose={() => {
        if (running) transfer.cancel();
        onClose();
      }}
      width="max-w-[560px]"
      footer={
        result ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            {running ? (
              <Button variant="ghost" onClick={transfer.cancel}>
                Cancel transfer
              </Button>
            ) : (
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Button variant="primary" disabled={blocked} onClick={go}>
              {running ? "Working…" : cta}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="text-base text-fg-2">
          <p>{summaryText(result, kind === "origin" ? "replayed" : "moved")}.</p>
          {result.failed > 0 && kind === "origin" && (
            <p className="mt-2 text-sm">Messages without an x-death header, or whose exchange no longer routes them, stay in the queue.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-base text-fg-2">
            {ready != null ? int(ready) : "…"} ready messages in <span className="font-mono text-[12.5px] text-fg">{source}</span>.
            Each one is published with a confirm and only then removed; what isn't moved goes back. Unacked messages stay with
            their consumers.
          </p>
          {readOnly && <p className="text-sm text-danger">This connection is read-only.</p>}
          {shovelOnly && (
            <p className="rounded-md bg-[color-mix(in_srgb,var(--color-warn)_9%,transparent)] px-2.5 py-2 text-sm text-fg-2">
              <b className="font-medium text-fg">AMQP is off for this connection.</b> Choosing messages, moving to an exchange and
              replaying need AMQP; all ready messages can still go to another queue through a one-off shovel.
            </p>
          )}

          <div>
            <span className={label}>Target</span>
            <SegmentedControl<Kind>
              aria-label="Target"
              value={kind}
              onChange={setKind}
              options={[
                { value: "queue", label: "Queue" },
                { value: "exchange", label: "Exchange" },
                { value: "origin", label: "Back to origin" },
              ]}
            />
          </div>

          {kind === "queue" && (
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className={label + " mb-0 flex-1"}>
                  Destination queue {targetQueue && <span className="font-mono font-normal text-fg">· {targetQueue}</span>}
                </span>
                <FilterField value={search} onChange={setSearch} placeholder="Search queues" className="w-48" />
              </div>
              <div className="flex h-48 flex-col overflow-hidden rounded-md border border-line">
                <DataTable
                  aria-label="Queues"
                  rows={rows}
                  columns={columns}
                  rowKey={(q) => q.name}
                  selected={selectedQueue}
                  onSelectionChange={(_, last) => last && setTargetQueue(last)}
                  empty={picker.loading ? "Loading…" : picker.error ?? "No queue matches."}
                />
              </div>
            </div>
          )}
          {kind === "exchange" && (
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className={label}>Exchange</span>
                <Input className="font-mono" value={exchange} onChange={(e) => setExchange(e.target.value)} placeholder='"" is the default exchange' spellCheck={false} />
              </label>
              <label>
                <span className={label}>Routing key</span>
                <Input className="font-mono" value={routingKey} onChange={(e) => setRoutingKey(e.target.value)} spellCheck={false} />
              </label>
            </div>
          )}
          {kind === "origin" && (
            <p className="text-sm text-fg-3">
              Each message goes back to the exchange and routing key it was first published with (its x-death header), so every
              queue bound there gets it again. Messages without x-death stay put.
            </p>
          )}

          <div>
            <span className={label}>How many</span>
            <div className="flex items-center gap-2">
              <SegmentedControl<Amount>
                aria-label="How many"
                value={amount}
                onChange={setAmount}
                options={[
                  ...(select?.length ? [{ value: "selected" as const, label: `The ${select.length} selected` }] : []),
                  { value: "all", label: "All ready" },
                  { value: "first", label: "First N" },
                ]}
              />
              {amount === "first" && (
                <Input className="h-7 w-24 font-mono" inputMode="numeric" value={first} onChange={(e) => setFirst(e.target.value)} aria-label="How many messages" />
              )}
            </div>
          </div>

          {running && (
            <div role="status" className="flex items-center gap-3 text-sm text-fg-2">
              <span className="h-1 flex-1 overflow-hidden rounded-xs bg-line" aria-hidden>
                <i className="block h-full bg-accent transition-[width] duration-150" style={{ width: `${pct * 100}%` }} />
              </span>
              <span className="font-mono text-[12px] tabular-nums">
                {int(running.done)} / {running.total ? int(running.total) : "…"}
              </span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
