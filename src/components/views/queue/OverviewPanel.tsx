import { useMemo } from "react";
import type { ReactNode } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { rateSamples, samplesOf, TimeSeriesChart, type Series } from "@/components/charts/TimeSeriesChart";
import { Inspector } from "@/components/data/Inspector";
import { JsonView } from "@/components/data/JsonView";
import { KeyValues, SectionHeader, Tag } from "@/components/data/parts";
import { Button } from "@/components/ui/button";
import { ago, bytes, compact, dateTime, int, rate, shortNode } from "@/lib/rabbit/format";
import type { Queue } from "@/types/rabbit";

/** Queue charts (depth, rates) and its definition, features and placement. */
export default function OverviewPanel({ queue: q }: { queue: Queue }) {
  const depth = useMemo<Series[]>(
    () => [
      { label: "Ready", color: "s1", points: samplesOf(q.messages_ready_details) },
      { label: "Unacked", color: "s2", points: samplesOf(q.messages_unacknowledged_details) },
      { label: "Total", color: "s3", points: samplesOf(q.messages_details) },
    ],
    [q.messages_ready_details, q.messages_unacknowledged_details, q.messages_details],
  );
  const ms = q.message_stats;
  const rates = useMemo<Series[]>(
    () => [
      { label: "Publish", color: "s1", points: rateSamples(ms?.publish_details) },
      { label: "Deliver", color: "s2", points: rateSamples(ms?.deliver_get_details ?? ms?.deliver_details) },
      { label: "Ack", color: "s3", points: rateSamples(ms?.ack_details) },
    ],
    [ms?.publish_details, ms?.deliver_get_details, ms?.deliver_details, ms?.ack_details],
  );

  const stream = q.type === "stream";
  const args = Object.entries(q.arguments ?? {});
  const placement: [ReactNode, ReactNode][] =
    q.type === "classic" || !q.type
      ? [["node", shortNode(q.node)]]
      : [
          ["leader", shortNode(q.leader ?? q.node)],
          [
            "members",
            (q.members ?? []).map((m) => (
              <span key={m} className={q.online && !q.online.includes(m) ? "mr-2 text-danger" : "mr-2"} title={q.online && !q.online.includes(m) ? "offline" : "online"}>
                {shortNode(m)}
              </span>
            )),
          ],
        ];
  const info: [ReactNode, ReactNode][] = [
    ["type", q.type ?? "classic"],
    ["state", q.state ?? "–"],
    ...placement,
    ...(q.delivery_limit != null ? ([["delivery limit", int(q.delivery_limit)]] as [ReactNode, ReactNode][]) : []),
    ...(stream
      ? ([
          ["segments", int(q.segments)],
          ["first offset", int(q.first_offset)],
          ["committed offset", int(q.committed_offset)],
        ] as [ReactNode, ReactNode][])
      : []),
    ["memory", bytes(q.memory)],
    ["message bytes", bytes(q.message_bytes)],
    ...(q.head_message_timestamp
      ? ([["head message", dateTime(q.head_message_timestamp * 1000)]] as [ReactNode, ReactNode][])
      : []),
    ...(q.idle_since ? ([["idle since", `${q.idle_since} (${ago(Date.parse(q.idle_since))})`]] as [ReactNode, ReactNode][]) : []),
  ];
  const effective = q.effective_policy_definition ?? {};

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 border-b border-line max-[1180px]:grid-cols-1">
          <section className="min-w-0 border-r border-line-soft max-[1180px]:border-r-0">
            <SectionHeader actions={<span className="font-normal normal-case text-fg-3">last 10 min</span>}>Queued messages</SectionHeader>
            <div className="px-3 pb-3">
              <TimeSeriesChart series={depth} format={compact} label="Queued messages, last 10 minutes" height={150} />
            </div>
          </section>
          <section className="min-w-0">
            <SectionHeader actions={<span className="font-normal normal-case text-fg-3">msg/s</span>}>Message rates</SectionHeader>
            <div className="px-3 pb-3">
              <TimeSeriesChart series={rates} format={(v) => rate(v)} label="Message rates, last 10 minutes" height={150} />
            </div>
          </section>
        </div>
        <SectionHeader>Features</SectionHeader>
        <div className="flex flex-wrap gap-1.5 px-3 pb-3">
          <Tag title={q.durable ? "Survives a broker restart" : "Lost on restart"}>{q.durable ? "durable" : "transient"}</Tag>
          {q.auto_delete && <Tag title="Deleted when its last consumer unsubscribes">auto-delete</Tag>}
          {q.exclusive && <Tag title="Used by one connection only, deleted when it closes">exclusive</Tag>}
          {args.map(([k, v]) => (
            <Tag key={k} title={`${k} = ${JSON.stringify(v)}`}>
              {k.replace(/^x-/, "")}
              {k !== "x-queue-type" && `: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`}
            </Tag>
          ))}
        </div>
      </div>
      <Inspector
        label="Queue"
        title={
          <>
            Queue{" "}
            <span className="font-normal text-fg-3">
              {q.vhost} / {q.name}
            </span>
          </>
        }
        actions={
          <Button
            variant="ghost"
            size="icon-sm"
            title="Copy name"
            aria-label="Copy name"
            onClick={() => void navigator.clipboard.writeText(q.name).then(() => toast.success("Copied", { description: q.name }))}
          >
            <Copy />
          </Button>
        }
      >
        <KeyValues rows={info} />
        <SectionHeader>Arguments {args.length}</SectionHeader>
        {args.length ? (
          <JsonView value={q.arguments} className="px-3 py-2" />
        ) : (
          <div className="px-3 py-2 text-sm text-fg-3">None.</div>
        )}
        <SectionHeader>Effective policy</SectionHeader>
        <KeyValues
          rows={[
            ["policy", q.policy || <span className="text-fg-3">none</span>],
            ["operator policy", q.operator_policy || <span className="text-fg-3">none</span>],
          ]}
        />
        {Object.keys(effective).length ? (
          <JsonView value={effective} className="px-3 pb-2" />
        ) : (
          <div className="px-3 pb-2 text-sm text-fg-3">No policy definition applies to this queue.</div>
        )}
      </Inspector>
    </div>
  );
}
