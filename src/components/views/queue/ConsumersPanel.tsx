import { useMemo } from "react";
import { Users } from "lucide-react";
import type { Column } from "@/components/data/DataTable";
import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/parts";
import { int, percent } from "@/lib/rabbit/format";
import { openOn } from "@/lib/rabbit/nav";
import type { Consumer, Queue } from "@/types/rabbit";

/** Who consumes the queue, from the queue detail's `consumer_details`. */
export default function ConsumersPanel({ cid, queue: q, dlq }: { cid: string; queue: Queue; dlq: boolean }) {
  const rows = q.consumer_details ?? [];
  const columns = useMemo<Column<Consumer>[]>(
    () => [
      { id: "n", header: "#", width: 44, align: "right", cell: (_, i) => <span className="text-fg-3">{i + 1}</span> },
      {
        id: "tag",
        header: "consumer_tag",
        width: 260,
        cell: (c) => <span className="text-json-bson">{c.consumer_tag}</span>,
        sortValue: (c) => c.consumer_tag,
      },
      {
        id: "channel",
        header: "channel",
        width: 300,
        cell: (c) => {
          const conn = c.channel_details?.connection_name;
          return conn ? (
            <button
              type="button"
              className="max-w-full truncate text-left text-accent-text hover:underline"
              title="Show the connection"
              onClick={() => openOn(cid, { kind: "connections", focus: conn })}
            >
              {c.channel_details.name}
            </button>
          ) : (
            c.channel_details?.name ?? "–"
          );
        },
        sortValue: (c) => c.channel_details?.name,
      },
      {
        id: "peer",
        header: "peer",
        width: 150,
        cell: (c) => (c.channel_details?.peer_host ? `${c.channel_details.peer_host}:${c.channel_details.peer_port ?? ""}` : "–"),
      },
      { id: "user", header: "user", width: 100, cell: (c) => c.channel_details?.user ?? "–", sortValue: (c) => c.channel_details?.user },
      {
        id: "ack",
        header: "ack",
        width: 72,
        cell: (c) => <span className="text-json-keyword">{c.ack_required ? "manual" : "auto"}</span>,
        sortValue: (c) => (c.ack_required ? 1 : 0),
      },
      {
        id: "prefetch",
        header: "prefetch",
        width: 76,
        align: "right",
        cell: (c) => <span className="text-json-number">{c.prefetch_count ? int(c.prefetch_count) : "∞"}</span>,
        sortValue: (c) => c.prefetch_count,
      },
      {
        id: "exclusive",
        header: "exclusive",
        width: 80,
        cell: (c) => <span className="text-json-keyword">{String(c.exclusive)}</span>,
      },
      {
        id: "active",
        header: "status",
        width: 110,
        cell: (c) => <span className="text-json-keyword">{c.activity_status ?? (c.active === false ? "waiting" : "up")}</span>,
        sortValue: (c) => c.activity_status,
      },
      {
        id: "args",
        header: "arguments",
        width: 220,
        cell: (c) =>
          c.arguments && Object.keys(c.arguments).length ? JSON.stringify(c.arguments) : <span className="text-fg-3">{"{}"}</span>,
      },
    ],
    [cid],
  );

  if (!rows.length) {
    return (
      <EmptyState icon={Users} title="No consumers">
        {dlq
          ? "Dead letter queues usually have none. Inspect the messages, fix the consumer, then replay."
          : "Messages pile up until a client calls basic.consume on this queue."}
      </EmptyState>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[34px] shrink-0 items-center gap-3 border-b border-line px-3 text-sm text-fg-2">
        <span>
          <b className="font-mono font-medium text-fg">{rows.length}</b> consumers
        </span>
        {q.consumer_utilisation != null && <span>{percent(q.consumer_utilisation)} utilisation</span>}
      </div>
      <DataTable
        aria-label="Consumers"
        rows={rows}
        columns={columns}
        rowKey={(c) => c.consumer_tag + c.channel_details?.name}
        rowTone={(c) => (c.active === false ? "muted" : null)}
      />
    </div>
  );
}
