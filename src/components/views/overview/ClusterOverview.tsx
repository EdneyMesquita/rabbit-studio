import { memo, useMemo } from "react";
import {
  Activity,
  ArrowLeftRight,
  Download,
  FileJson,
  Flag,
  Gauge,
  Globe,
  Inbox,
  Layers,
  Plug,
  Radio,
  Shield,
  Split,
  Users,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TimeSeriesChart, rateSamples, samplesOf } from "@/components/charts/TimeSeriesChart";
import { DataTable, type Column } from "@/components/data/DataTable";
import { Inspector } from "@/components/data/Inspector";
import { ErrorState, KeyValues, Loading, Metrics, Notice, SectionHeader, StateLabel, ViewTitle, ViewToolbar, type MetricItem } from "@/components/data/parts";
import { Button } from "@/components/ui/button";
import { useLive } from "@/hooks/useLive";
import { rabbit } from "@/lib/rabbit/client";
import { compact, int, rate, shortNode } from "@/lib/rabbit/format";
import { openOn } from "@/lib/rabbit/nav";
import { paths, withQuery } from "@/lib/rabbit/paths";
import { ADMIN_SECTIONS, type AdminSection } from "@/store/sessionsStore";
import type { Overview, Page, Queue } from "@/types/rabbit";
import { connectionIdOf, RateCell, Zero } from "../lists/common";
import { fetchProblemInputs, type ProblemInputs } from "../problems/inputs";
import { clusterProblems, isDeadLetterQueue, queueStatus } from "../problems/issues";
import { ProblemList } from "../problems/ProblemRows";
import { NodeTable, useNodes } from "../runtime/nodesData";
import type { ViewProps } from "../types";

const OVERVIEW_COLUMNS =
  "cluster_name,rabbitmq_version,management_version,erlang_version,node,queue_totals,object_totals,message_stats,listeners";
/** Ten minutes of samples, one per 10 s: the lengths and message rates the two charts draw. */
const SAMPLES = { lengths_age: 600, lengths_incr: 10, msg_rates_age: 600, msg_rates_incr: 10 };

const TOP_COLUMNS = "name,vhost,type,state,messages,messages_ready,messages_unacknowledged,consumers,message_stats.publish_details.rate,message_stats.deliver_get_details.rate";

const ADMIN_ICONS: Record<AdminSection, LucideIcon> = {
  users: Users,
  vhosts: Layers,
  policies: Shield,
  limits: Gauge,
  flags: Flag,
  federation: Globe,
  shovels: ArrowLeftRight,
  definitions: FileJson,
};

const topColumns: Column<Queue>[] = [
  { id: "name", header: "queue", cell: (q) => q.name },
  { id: "vhost", header: "vhost", width: 130, cell: (q) => <span className="text-fg-3">{q.vhost}</span> },
  {
    id: "state",
    header: "state",
    width: 160,
    mono: false,
    cell: (q) => {
      const s = queueStatus(q);
      return <StateLabel tone={s.tone}>{s.label}</StateLabel>;
    },
  },
  { id: "ready", header: "ready", align: "right", width: 90, cell: (q) => <Zero n={q.messages_ready} /> },
  { id: "in", header: "in", align: "right", width: 80, cell: (q) => <RateCell rate={q.message_stats?.publish_details?.rate} /> },
  { id: "out", header: "out", align: "right", width: 80, cell: (q) => <RateCell rate={q.message_stats?.deliver_get_details?.rate} /> },
];

export default function ClusterOverview({ tab, shown }: ViewProps) {
  const cid = connectionIdOf(tab);
  // Sampled every 10 s: the charts have no finer grain.
  const overview = useLive<Overview>(
    `${cid}:overview`,
    () => rabbit(cid).get<Overview>(withQuery(paths.overview, { columns: OVERVIEW_COLUMNS, ...SAMPLES })),
    { enabled: shown, interval: 10_000 },
  );
  const nodes = useNodes(cid, shown);
  // The same key the problems panel polls, so open together they cost one request.
  const inputs = useLive<ProblemInputs>(`${cid}:problems`, () => fetchProblemInputs(cid), { enabled: shown });
  const top = useLive<Queue[]>(
    `${cid}:queues:top`,
    () =>
      rabbit(cid)
        .get<Page<Queue> | Queue[]>(withQuery(paths.queues(), { columns: TOP_COLUMNS, page: 1, page_size: 8, sort: "messages", sort_reverse: true }))
        .then((a) => (Array.isArray(a) ? a : (a.items ?? []))),
    { enabled: shown },
  );

  const o = overview.data;
  const nodeList = useMemo(() => nodes.data ?? [], [nodes.data]);
  const problems = useMemo(() => clusterProblems({ queues: inputs.data?.queues, nodes: nodeList.length ? nodeList : inputs.data?.nodes }), [inputs.data, nodeList]);
  const alarms = useMemo(() => problems.filter((p) => p.target.kind === "nodes"), [problems]);
  const dead = useMemo(() => (inputs.data?.queues ?? []).filter((q) => isDeadLetterQueue(q.name) && q.type !== "stream" && (q.messages_ready ?? 0) > 0), [inputs.data]);
  
  const series = useMemo(() => {
    const q = o?.queue_totals;
    const m = o?.message_stats;
    return {
      depth: [
        { label: "Ready", color: "s1" as const, points: samplesOf(q?.messages_ready_details) },
        { label: "Unacked", color: "s2" as const, points: samplesOf(q?.messages_unacknowledged_details) },
      ],
      rates: [
        { label: "Publish", color: "s1" as const, points: rateSamples(m?.publish_details) },
        { label: "Deliver", color: "s2" as const, points: rateSamples(m?.deliver_get_details) },
        { label: "Ack", color: "s3" as const, points: rateSamples(m?.ack_details) },
      ],
    };
  }, [o]);

  if (!o) {
    return overview.error ? (
      <div className="flex h-full flex-col bg-editor">
        <ErrorState error={overview.error} onRetry={() => void overview.refresh()} />
      </div>
    ) : (
      <div className="flex h-full flex-col bg-editor">
        <Loading />
      </div>
    );
  }

  const go = (kind: "queues" | "connections" | "channels" | "nodes" | "exchanges") => () => openOn(cid, { kind });
  const totals = o.queue_totals;
  const objects = o.object_totals;
  const up = nodeList.filter((n) => n.running !== false).length;
  const withoutConsumers = (inputs.data?.queues ?? []).filter((q) => q.type !== "stream" && (q.consumers ?? 0) === 0 && (q.messages_ready ?? 0) > 0).length;
  const metrics: MetricItem[] = [
    { label: "Ready", value: compact(totals?.messages_ready), detail: `${int(totals?.messages_unacknowledged)} unacked`, onClick: go("queues"), title: "Open queues" },
    { label: "Publish", value: rate(o.message_stats?.publish_details?.rate), detail: `confirm ${rate(o.message_stats?.confirm_details?.rate)}` },
    { label: "Deliver", value: rate(o.message_stats?.deliver_get_details?.rate), detail: `ack ${rate(o.message_stats?.ack_details?.rate)}` },
    { label: "Connections", icon: Plug, value: int(objects?.connections), onClick: go("connections"), title: "Open connections" },
    { label: "Channels", icon: Radio, value: int(objects?.channels), onClick: go("channels"), title: "Open channels" },
    { label: "Exchanges", icon: Split, value: int(objects?.exchanges), onClick: go("exchanges"), title: "Open exchanges" },
    { label: "Queues", icon: Inbox, value: int(objects?.queues), onClick: go("queues"), title: "Open queues" },
    {
      label: "Consumers",
      value: int(objects?.consumers),
      detail: withoutConsumers ? `${withoutConsumers} queues hold messages without` : undefined,
      tone: withoutConsumers ? "warn" : undefined,
      onClick: go("queues"),
    },
    {
      label: "Nodes",
      value: nodeList.length ? `${up} / ${nodeList.length}` : "–",
      detail: up < nodeList.length ? `${nodeList.length - up} down` : "all up",
      tone: nodeList.length && up < nodeList.length ? "crit" : undefined,
      onClick: go("nodes"),
      title: "Open nodes",
    },
    {
      label: "Alarms",
      value: int(alarms.filter((a) => a.severity === "crit").length),
      detail: alarms.length ? "see nodes" : "none",
      tone: alarms.some((a) => a.severity === "crit") ? "crit" : undefined,
      onClick: go("nodes"),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <ViewToolbar>
        <ViewTitle icon={Activity} name={o.cluster_name} kind={`RabbitMQ ${o.rabbitmq_version}${o.erlang_version ? ` · Erlang ${o.erlang_version}` : ""}`} />
        <div className="flex-1" />
        <Button variant="ghost" onClick={() => openOn(cid, { kind: "admin", section: "definitions" })}>
          <Download />
          Export definitions
        </Button>
        <Button variant="ghost" onClick={() => openOn(cid, { kind: "topology" })}>
          <Workflow />
          Topology
        </Button>
      </ViewToolbar>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          {alarms
            .filter((p) => p.severity === "crit")
            .map((p) => (
              <Notice key={p.id} tone="crit" actions={<Button size="sm" onClick={go("nodes")}>Nodes</Button>}>
                <b className="font-mono">{shortNode(p.object)}</b> · {p.title}. {p.detail}.
              </Notice>
            ))}
          {dead.length > 0 && (
            <Notice tone="warn" actions={<Button size="sm" onClick={() => openOn(cid, { kind: "queue", vhost: dead[0].vhost, name: dead[0].name, view: "messages" })}>Open</Button>}>
              <b>
                {int(dead.reduce((a, q) => a + (q.messages_ready ?? 0), 0))} messages in {dead.length} dead-letter {dead.length === 1 ? "queue" : "queues"}.
              </b>{" "}
              {dead
                .slice(0, 3)
                .map((q) => q.name)
                .join(", ")}
              {dead.length > 3 ? ", ..." : ""}
            </Notice>
          )}
          <Metrics items={metrics} />
          <div className="grid shrink-0 grid-cols-2 border-b border-line max-[1180px]:grid-cols-1">
            <section className="min-w-0 border-r border-line max-[1180px]:border-r-0 max-[1180px]:border-b">
              <SectionHeader actions={<span className="font-normal normal-case">all queues</span>}>Queued messages</SectionHeader>
              <div className="px-3 pt-1 pb-3">
                <TimeSeriesChart series={series.depth} height={120} format={compact} label="Queued messages, last 10 minutes" />
              </div>
            </section>
            <section className="min-w-0">
              <SectionHeader actions={<span className="font-normal normal-case">msg/s</span>}>Message rates</SectionHeader>
              <div className="px-3 pt-1 pb-3">
                <TimeSeriesChart series={series.rates} height={120} format={rate} label="Message rates, last 10 minutes" />
              </div>
            </section>
          </div>
          <SectionHeader actions={<span className="font-mono">{nodeList.length}</span>}>Nodes</SectionHeader>
          <NodeTable rows={nodeList} onOpen={(n) => openOn(cid, { kind: "nodes", focus: n.name })} />
          <SectionHeader>Largest queues</SectionHeader>
          <DataTable
            aria-label="Largest queues"
            rows={top.data ?? []}
            columns={topColumns}
            rowKey={(q) => `${q.vhost}\u0000${q.name}`}
            onOpen={(q) => openOn(cid, { kind: "queue", vhost: q.vhost, name: q.name })}
            className="flex-none overflow-x-auto"
            empty="No queues yet."
          />
        </div>
        <ClusterInspector cid={cid} overview={o} problems={problems} />
      </div>
    </div>
  );
}

const ClusterInspector = memo(function ClusterInspector({
  cid,
  overview: o,
  problems,
}: {
  cid: string;
  overview: Overview;
  problems: ReturnType<typeof clusterProblems>;
}) {
  return (
    <Inspector label="Cluster" title="Cluster" subtitle={o.cluster_name}>
      <KeyValues
        rows={[
          ["cluster", o.cluster_name],
          ["rabbitmq", o.rabbitmq_version],
          ["erlang", o.erlang_version ?? "–"],
          ["management", o.management_version ?? "–"],
          ["answered by", shortNode(o.node)],
        ]}
      />
      <SectionHeader actions={<span className="font-mono">{problems.length}</span>}>Problems</SectionHeader>
      {problems.length ? <ProblemList connectionId={cid} problems={problems} /> : <p className="px-3 py-2 text-sm text-fg-3">Nothing needs attention.</p>}
      <SectionHeader>Administration</SectionHeader>
      <div>
        {ADMIN_SECTIONS.map((s) => {
          const Icon = ADMIN_ICONS[s.id];
          return (
            <button
              key={s.id}
              type="button"
              className="flex h-[26px] w-full items-center gap-2 px-3 text-left text-base text-fg hover:bg-row-hover [&_svg]:size-3.5 [&_svg]:text-fg-3"
              onClick={() => openOn(cid, { kind: "admin", section: s.id })}
            >
              <Icon aria-hidden />
              {s.label}
            </button>
          );
        })}
      </div>
      <SectionHeader>Listeners</SectionHeader>
      <KeyValues rows={(o.listeners ?? []).map((l): [string, string] => [l.protocol, `${l.port} · ${shortNode(l.node)}`])} />
    </Inspector>
  );
});
