import { useMemo } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { rateSamples, samplesOf, TimeSeriesChart, type Series } from "@/components/charts/TimeSeriesChart";
import { Inspector } from "@/components/data/Inspector";
import { Dash, SectionHeader, Tag } from "@/components/data/parts";
import { TypedTree } from "@/components/data/TypedTree";
import { Button } from "@/components/ui/button";
import { ago, bytes, compact, dateTime, rate, shortNode } from "@/lib/rabbit/format";
import type { Queue } from "@/types/rabbit";
import type { QueueEvent } from "./lib/events";

/** Queue charts (depth, rates) and its definition, features and placement. */
export default function OverviewPanel({ queue: q, events }: { queue: Queue; events: QueueEvent[] }) {
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
  const info: Record<string, unknown> = {
    type: q.type ?? "classic",
    state: q.state,
    ...(q.type === "classic" || !q.type ? { node: shortNode(q.node) } : { leader: shortNode(q.leader ?? q.node), members: (q.members ?? []).map(shortNode) }),
    ...(q.delivery_limit != null ? { delivery_limit: q.delivery_limit } : {}),
    ...(stream ? { segments: q.segments, first_offset: q.first_offset, committed_offset: q.committed_offset } : {}),
    memory: bytes(q.memory),
    message_bytes: bytes(q.message_bytes),
    ...(q.head_message_timestamp ? { head_message: dateTime(q.head_message_timestamp * 1000) } : {}),
    ...(q.idle_since ? { idle_since: `${dateTime(Date.parse(q.idle_since))} (${ago(Date.parse(q.idle_since))})` } : {}),
  };
  const policies: Record<string, unknown> = {
    ...(q.policy ? { policy: q.policy } : {}),
    ...(q.operator_policy ? { operator_policy: q.operator_policy } : {}),
  };
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
        <SectionHeader count={events.length || undefined}>Recent events</SectionHeader>
        {events.length ? (
          <ul className="px-3 pb-3 font-data text-[12px] leading-5">
            {events.map((e, i) => (
              <li key={i} className="flex gap-3">
                <span className="shrink-0 text-fg-3">{dateTime(e.at)}</span>
                <span className="min-w-0 truncate text-fg-2">{e.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-3 pb-3 text-sm text-fg-3">No changes seen since this queue was opened.</div>
        )}
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
        <TypedTree value={info} open={1} />
        <SectionHeader>Features</SectionHeader>
        <div className="flex flex-wrap gap-1.5 px-3 pb-3">
          <Tag title={q.durable ? "Survives a broker restart" : "Lost on restart"}>{q.durable ? "durable" : "transient"}</Tag>
          {q.auto_delete && <Tag title="Deleted when its last consumer unsubscribes">auto-delete</Tag>}
          {q.exclusive && <Tag title="Used by one connection only, deleted when it closes">exclusive</Tag>}
        </div>
        <SectionHeader count={args.length}>Arguments</SectionHeader>
        {args.length ? (
          <TypedTree value={q.arguments ?? {}} open={1} />
        ) : (
          <div className="px-3 py-1">
            <Dash />
          </div>
        )}
        <SectionHeader count={Object.keys(effective).length || undefined}>Effective policy</SectionHeader>
        {Object.keys(policies).length > 0 && <TypedTree value={policies} open={1} />}
        {Object.keys(effective).length ? (
          <TypedTree value={effective} open={1} />
        ) : (
          <div className="px-3 py-1">
            <Dash />
          </div>
        )}
      </Inspector>
    </div>
  );
}
