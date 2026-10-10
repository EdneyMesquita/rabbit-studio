import { Fragment, memo, useCallback, useMemo, useState } from "react";
import { TimeSeriesChart, rateSamples, samplesOf } from "@/components/charts/TimeSeriesChart";
import { Inspector } from "@/components/data/Inspector";
import { Dash, Metrics, SectionHeader, StateLabel, type MetricItem, type Tone } from "@/components/data/parts";
import { Button } from "@/components/ui/button";
import { ConnectionChip } from "@/components/ui/ConnectionChip";
import { connectionColor } from "@/lib/connectionColor";
import { rabbit } from "@/lib/rabbit/client";
import { compact, int, rate } from "@/lib/rabbit/format";
import { openOn } from "@/lib/rabbit/nav";
import { paths, withQuery } from "@/lib/rabbit/paths";
import { cn } from "@/lib/utils";
import { useConnectionsStore } from "@/store/connectionsStore";
import { ENVIRONMENTS, type ConnectionProfileMeta } from "@/types/connection";
import type { Overview } from "@/types/rabbit";
import { ClusterProbe } from "../problems/ClusterProbe";
import { fetchProblemInputs, type ProblemInputs } from "../problems/inputs";
import { isDeadLetterQueue, nodeProblems } from "../problems/issues";
import { ClusterProblemList } from "../problems/ProblemRows";
import { useClusterProblems } from "../problems/useClusterProblems";
import type { ViewProps } from "../types";

/** What the strip needs of a cluster: the overview's totals and the problem inputs (queues, nodes). */
interface Snapshot {
  overview: Overview;
  inputs: ProblemInputs;
}

interface Entry {
  data?: Snapshot;
  error: string | null;
}

interface Part<T> {
  data?: T;
  error: string | null;
}

// Totals, five minutes of queue depth and ten of publish/deliver samples (the throughput chart): the cheapest answer that fills a row.
const OVERVIEW_COLUMNS = "cluster_name,rabbitmq_version,queue_totals,object_totals,message_stats.publish_details,message_stats.deliver_get_details";

function fetchOverview(connectionId: string): Promise<Overview> {
  return rabbit(connectionId).get<Overview>(
    withQuery(paths.overview, {
      columns: OVERVIEW_COLUMNS,
      lengths_age: 300,
      lengths_incr: 10,
      msg_rates_age: 600,
      msg_rates_incr: 10,
    }),
  );
}

/** Samples of one rate per cluster, summed by timestamp bucket (clusters sample on their own clocks). */
function sumRates(perCluster: { t: number; v: number }[][]): { t: number; v: number }[] {
  const buckets = new Map<number, { v: number; n: number }>();
  for (const points of perCluster) {
    for (const p of points) {
      const t = Math.round(p.t / 10_000) * 10_000;
      const b = buckets.get(t) ?? { v: 0, n: 0 };
      b.v += p.v;
      b.n++;
      buckets.set(t, b);
    }
  }
  // A bucket some cluster missed would dip the line: keep the full ones.
  const full = Math.max(0, ...[...buckets.values()].map((b) => b.n));
  return [...buckets.entries()]
    .filter(([, b]) => b.n === full)
    .map(([t, b]) => ({ t, v: b.v }))
    .sort((a, b) => a.t - b.t);
}

type Health = { tone: Tone; label: string };

function healthOf(entry: Entry | undefined): Health {
  if (!entry) return { tone: "idle", label: "Checking" };
  if (!entry.data) return { tone: "crit", label: "Unreachable" };
  const nodes = entry.data.inputs.nodes;
  const bad = nodes.some((n) => nodeProblems(n).length > 0);
  return bad ? { tone: "warn", label: "Degraded" } : { tone: "ok", label: "Healthy" };
}

export default function GlobalView({ shown }: ViewProps) {
  const profiles = useConnectionsStore((s) => s.profiles);
  const sessions = useConnectionsStore((s) => s.sessions);
  const connecting = useConnectionsStore((s) => s.connecting);
  const connectErrors = useConnectionsStore((s) => s.connectErrors);
  const connected = useMemo(() => profiles.filter((p) => sessions[p.id]), [profiles, sessions]);
  // Two answers per cluster: its overview, and the problem inputs under the
  // key the Problems panel and the cluster overview share (one fetch for all).
  const [overviews, setOverviews] = useState<Record<string, Part<Overview> | undefined>>({});
  const [inputsBy, setInputsBy] = useState<Record<string, Part<ProblemInputs> | undefined>>({});
  const onOverview = useCallback((id: string, data: Overview | undefined, error: string | null) => {
    setOverviews((s) => (s[id]?.data === data && s[id]?.error === error ? s : { ...s, [id]: { data, error } }));
  }, []);
  const onInputs = useCallback((id: string, data: ProblemInputs | undefined, error: string | null) => {
    setInputsBy((s) => (s[id]?.data === data && s[id]?.error === error ? s : { ...s, [id]: { data, error } }));
  }, []);
  const entries = useMemo(() => {
    const out: Record<string, Entry | undefined> = {};
    for (const id of new Set([...Object.keys(overviews), ...Object.keys(inputsBy)])) {
      const o = overviews[id];
      const i = inputsBy[id];
      if (!o && !i) continue;
      out[id] = {
        data: o?.data && i?.data ? { overview: o.data, inputs: i.data } : undefined,
        error: o?.error ?? i?.error ?? null,
      };
    }
    return out;
  }, [overviews, inputsBy]);

  const problems = useClusterProblems(
    connected,
    useMemo(() => Object.fromEntries(Object.entries(entries).map(([id, e]) => [id, e && { data: e.data?.inputs, error: e.error }])), [entries]),
  );

  const groups = useMemo(
    () =>
      ENVIRONMENTS.map((env) => ({
        ...env,
        profiles: profiles.filter((p) => p.environment === env.id),
      })).filter((g) => g.profiles.length),
    [profiles],
  );

  // Totals over the clusters that answered.
  const totals = useMemo(() => {
    let publish = 0;
    let deliver = 0;
    let ready = 0;
    let queues = 0;
    let connections = 0;
    let consumers = 0;
    let dead = 0;
    let deadQueues = 0;
    let ok = 0;
    let degraded = 0;
    let down = 0;
    for (const p of connected) {
      const e = entries[p.id];
      const h = healthOf(e);
      if (!e?.data) {
        if (e) down++;
        continue;
      }
      if (h.tone === "ok") ok++;
      else degraded++;
      const { overview, inputs } = e.data;
      publish += overview.message_stats?.publish_details?.rate ?? 0;
      deliver += overview.message_stats?.deliver_get_details?.rate ?? 0;
      ready += overview.queue_totals?.messages_ready ?? 0;
      queues += overview.object_totals?.queues ?? 0;
      connections += overview.object_totals?.connections ?? 0;
      consumers += overview.object_totals?.consumers ?? 0;
      for (const q of inputs.queues) {
        if (q.type !== "stream" && isDeadLetterQueue(q.name) && (q.messages_ready ?? 0) > 0) {
          dead += q.messages_ready ?? 0;
          deadQueues++;
        }
      }
    }
    return {
      publish,
      deliver,
      ready,
      queues,
      connections,
      consumers,
      dead,
      deadQueues,
      ok,
      degraded,
      down,
    };
  }, [connected, entries]);

  const metrics: MetricItem[] = [
    {
      label: "Clusters",
      value: int(profiles.length),
      detail: `${connected.length} connected${totals.degraded ? `, ${totals.degraded} degraded` : ""}${totals.down ? `, ${totals.down} down` : ""}`,
    },
    {
      label: "Publish, all clusters",
      value: rate(totals.publish),
      detail: `deliver ${rate(totals.deliver)}`,
    },
    {
      label: "Ready",
      value: compact(totals.ready),
      detail: `across ${int(totals.queues)} queues`,
    },
    {
      label: "Dead-lettered",
      value: int(totals.dead),
      tone: totals.dead ? "warn" : undefined,
      detail: `in ${totals.deadQueues} DLQs`,
    },
    {
      label: "Connections",
      value: int(totals.connections),
      detail: `${int(totals.consumers)} consumers`,
    },
  ];

  const throughput = useMemo(() => {
    const ovs = connected.map((p) => entries[p.id]?.data?.overview).filter((o): o is Overview => !!o);
    return [
      {
        label: "Publish",
        color: "s1" as const,
        points: sumRates(ovs.map((o) => rateSamples(o.message_stats?.publish_details))),
      },
      {
        label: "Deliver",
        color: "s2" as const,
        points: sumRates(ovs.map((o) => rateSamples(o.message_stats?.deliver_get_details))),
      },
    ];
  }, [connected, entries]);

  const clusterCount = new Set(problems.map((p) => p.connectionId)).size;

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      {shown &&
        connected.map((p) => (
          <Fragment key={p.id}>
            <ClusterProbe<Overview>
              connectionId={p.id}
              liveKey={`${p.id}:overview:global`}
              fetcher={() => fetchOverview(p.id)}
              onData={onOverview}
              interval={10_000}
            />
            <ClusterProbe<ProblemInputs>
              connectionId={p.id}
              liveKey={`${p.id}:problems`}
              fetcher={() => fetchProblemInputs(p.id)}
              onData={onInputs}
              interval={10_000}
            />
          </Fragment>
        ))}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">
          <Metrics items={metrics} />
          {profiles.length === 0 ? (
            <p className="px-3 py-3 text-sm text-fg-3">No connections yet. Add one from the Explorer to see it here.</p>
          ) : (
            <table className="w-full min-w-max table-fixed border-separate border-spacing-0 font-data" aria-label="Clusters">
              <colgroup>
                {/* Compact, so the numbers fit beside the problems inspector. */}
                <col style={{ width: 172 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 56 }} />
                <col style={{ width: 52 }} />
                <col style={{ width: 64 }} />
                <col style={{ width: 64 }} />
                <col style={{ width: 64 }} />
                <col style={{ width: 60 }} />
                <col style={{ width: 52 }} />
                <col style={{ width: 64 }} />
                <col style={{ width: 100 }} />
              </colgroup>
              <thead>
                <tr>
                  {[
                    "connection",
                    "status",
                    "cluster",
                    "version",
                    "nodes",
                    "publish",
                    "deliver",
                    "ready",
                    "unacked",
                    "conns",
                    "problems",
                    "queue depth",
                  ].map((h, i) => (
                    <th
                      key={h}
                      scope="col"
                      className={cn(
                        "sticky top-0 z-[2] h-[30px] border-r border-b border-r-line-soft border-b-line bg-panel px-2.5 font-sans text-sm font-medium whitespace-nowrap text-fg-2 last:border-r-0",
                        i >= 5 && i <= 10 ? "text-right" : "text-left",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <GroupRows key={g.id} label={g.label} profiles={g.profiles}>
                    {(p) => (
                      <ClusterRow
                        key={p.id}
                        profile={p}
                        connected={!!sessions[p.id]}
                        connecting={!!connecting[p.id]}
                        connectError={connectErrors[p.id]}
                        entry={entries[p.id]}
                        problemCount={problems.filter((x) => x.connectionId === p.id).length}
                        hasCrit={problems.some((x) => x.connectionId === p.id && x.problem.severity === "crit")}
                      />
                    )}
                  </GroupRows>
                ))}
              </tbody>
            </table>
          )}
          {connected.length > 0 && (
            <>
              <SectionHeader actions={<span className="font-normal">msg/s</span>}>Throughput, all reachable clusters</SectionHeader>
              <div className="px-3 pt-1 pb-3">
                <TimeSeriesChart
                  series={throughput}
                  height={120}
                  format={rate}
                  label="Publish and deliver rates summed over all reachable clusters, last 10 minutes"
                />
              </div>
            </>
          )}
        </div>
        {connected.length > 0 && (
          <Inspector
            label="Problems"
            title="Problems"
            subtitle={`${problems.length} across ${clusterCount} ${clusterCount === 1 ? "cluster" : "clusters"}`}
          >
            {problems.length ? <ClusterProblemList items={problems} /> : <p className="px-3 py-2 text-sm text-fg-3">Nothing needs attention.</p>}
            <div className="sticky bottom-0 border-t border-line-soft bg-editor px-3 py-[7px] text-xs text-fg-3">
              Sorted by severity, production first
            </div>
          </Inspector>
        )}
      </div>
    </div>
  );
}

function GroupRows({
  label,
  profiles,
  children,
}: {
  label: string;
  profiles: ConnectionProfileMeta[];
  children: (p: ConnectionProfileMeta) => React.ReactNode;
}) {
  return (
    <>
      <tr>
        <td colSpan={12} className="h-6 border-b border-line-soft bg-panel px-2.5 font-sans text-sm font-medium text-fg-2">
          {label} <span className="font-normal text-fg-3">{profiles.length}</span>
        </td>
      </tr>
      {profiles.map(children)}
    </>
  );
}

const td = "h-6 border-b border-line-soft px-2.5 whitespace-nowrap overflow-hidden text-ellipsis";

const ClusterRow = memo(function ClusterRow({
  profile,
  connected,
  connecting,
  connectError,
  entry,
  problemCount,
  hasCrit,
}: {
  profile: ConnectionProfileMeta;
  connected: boolean;
  connecting: boolean;
  connectError?: string;
  entry: Entry | undefined;
  problemCount: number;
  hasCrit: boolean;
}) {
  const color = connectionColor(profile.id, profile.color);
  const snap = connected ? entry?.data : undefined;
  const health: Health = !connected
    ? connecting
      ? { tone: "info", label: "Connecting" }
      : connectError
        ? { tone: "crit", label: "Failed" }
        : { tone: "idle", label: "Not connected" }
    : healthOf(entry);
  const o = snap?.overview;
  const nodes = snap?.inputs.nodes ?? [];
  const open = () => connected && openOn(profile.id, { kind: "overview" });
  const dash = <Dash />;
  const depth = useMemo(() => samplesOf(o?.queue_totals?.messages_details), [o]);

  return (
    <tr className={cn("group/row", connected ? "cursor-pointer" : "cursor-default")} onClick={open} title={connectError}>
      <td className={cn(td, "group-hover/row:bg-row-hover")}>
        <span className="inline-flex items-center gap-2 font-sans text-base text-fg">
          <ConnectionChip name={profile.name} color={color} size="sm" />
          <span className="truncate">{profile.name}</span>
        </span>
      </td>
      <td className={cn(td, "font-sans group-hover/row:bg-row-hover")}>
        {!connected && !connecting ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              void useConnectionsStore.getState().connect(profile.id);
            }}
          >
            Connect
          </Button>
        ) : (
          <StateLabel tone={health.tone}>{health.label}</StateLabel>
        )}
      </td>
      <td className={cn(td, "group-hover/row:bg-row-hover")}>{o?.cluster_name ?? dash}</td>
      <td className={cn(td, "text-fg-3 group-hover/row:bg-row-hover")}>{o?.rabbitmq_version ?? dash}</td>
      <td className={cn(td, "group-hover/row:bg-row-hover")}>
        <span className="inline-flex gap-[3px] align-middle">
          {nodes.map((n) => {
            const ps = nodeProblems(n);
            const tone = ps.some((x) => x.severity === "crit") ? "bg-danger" : ps.length ? "bg-warn" : "bg-ok";
            return <i key={n.name} title={n.name} className={cn("inline-block h-1.5 w-3 rounded-[2px]", tone)} />;
          })}
          {!nodes.length && dash}
        </span>
      </td>
      <td className={cn(td, "text-right group-hover/row:bg-row-hover")}>{o ? rate(o.message_stats?.publish_details?.rate) : dash}</td>
      <td className={cn(td, "text-right group-hover/row:bg-row-hover")}>{o ? rate(o.message_stats?.deliver_get_details?.rate) : dash}</td>
      <td className={cn(td, "text-right group-hover/row:bg-row-hover")}>{o ? compact(o.queue_totals?.messages_ready) : dash}</td>
      <td className={cn(td, "text-right group-hover/row:bg-row-hover")}>{o ? compact(o.queue_totals?.messages_unacknowledged) : dash}</td>
      <td className={cn(td, "text-right group-hover/row:bg-row-hover")}>{o ? int(o.object_totals?.connections) : dash}</td>
      <td className={cn(td, "text-right group-hover/row:bg-row-hover", problemCount ? (hasCrit ? "text-danger" : "text-warn") : "text-fg-3")}>
        {connected && entry ? problemCount : dash}
      </td>
      <td className={cn(td, "group-hover/row:bg-row-hover")}>
        <Sparkline points={depth} label={`${profile.name} queue depth, last 5 minutes`} />
      </td>
    </tr>
  );
});

/** A tiny line of queue depth: an SVG path is lighter than a canvas per row. */
const Sparkline = memo(function Sparkline({ points, label }: { points: { t: number; v: number }[]; label: string }) {
  const d = useMemo(() => {
    if (points.length < 2) return null;
    const t0 = points[0].t;
    const span = points[points.length - 1].t - t0 || 1;
    const max = Math.max(...points.map((p) => p.v), 1);
    return points.map((p, i) => `${i ? "L" : "M"}${(((p.t - t0) / span) * 100).toFixed(1)} ${(18 - (p.v / max) * 16).toFixed(1)}`).join("");
  }, [points]);
  if (!d) return <Dash />;
  return (
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="block h-5 w-full" role="img" aria-label={label}>
      <path d={d} fill="none" stroke="var(--t-s1)" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
});
