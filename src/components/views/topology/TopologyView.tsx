import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";
import { ArrowUpRight, Inbox, Route as RouteIcon, Split } from "lucide-react";
import { EmptyState, ErrorState, FilterField, KeyValues, Loading, Notice, SectionHeader, Spacer, StateLabel, ViewToolbar } from "@/components/data/parts";
import { Inspector } from "@/components/data/Inspector";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useLive } from "@/hooks/useLive";
import { rabbit } from "@/lib/rabbit/client";
import { compact } from "@/lib/rabbit/format";
import { openOn } from "@/lib/rabbit/nav";
import { paths, withQuery } from "@/lib/rabbit/paths";
import { cn } from "@/lib/utils";
import type { Binding, Exchange, Queue, VHost } from "@/types/rabbit";
import { bindingLabel, route } from "../publish/routing";
import type { ViewProps } from "../types";
import { buildLayout, deadLetter, nodeId, NODE_H, NODE_W, pathsThrough, type LEdge, type LNode, type Layout, type TopologyData } from "./layout";
import PanZoom from "./PanZoom";

const CAP = 300;
const PAGE = 500;
const SLOW = 30_000;

type Paged<T> = T[] | { items: T[]; total_count?: number };
const itemsOf = <T,>(r: Paged<T>): T[] => (Array.isArray(r) ? r : r.items);
const totalOf = <T,>(r: Paged<T>): number => (Array.isArray(r) ? r.length : (r.total_count ?? r.items.length));

interface Loaded extends TopologyData {
  /** Queues on the broker beyond what was read. */
  queuesTotal: number;
  exchanges: (TopologyData["exchanges"][number] & { rate?: number })[];
}

interface Incoming {
  incoming?: { channel_details?: { connection_name?: string; name?: string } }[];
}

async function load(connectionId: string, vhost: string): Promise<Loaded> {
  const api = rabbit(connectionId);
  const [ex, qs, bindings, cons] = await Promise.all([
    api.get<Paged<Exchange>>(withQuery(paths.exchanges(vhost), { columns: "name,type,internal,policy,message_stats", page: 1, page_size: PAGE })),
    api.get<Paged<Queue>>(
      withQuery(paths.queues(vhost), { columns: "name,type,arguments,policy,effective_policy_definition", page: 1, page_size: PAGE }),
    ),
    api.get<Binding[]>(withQuery(paths.bindings(vhost), { columns: "source,destination,destination_type,routing_key,arguments,properties_key" })),
    api.get<{ queue: { name: string }; channel_details?: { connection_name?: string; name?: string } }[]>(
      withQuery(paths.consumers(vhost), { columns: "queue,channel_details" }),
    ),
  ]);
  const exchanges = itemsOf(ex).map((e) => ({
    name: e.name,
    type: e.type,
    internal: e.internal,
    policy: e.policy,
    rate: e.message_stats?.publish_in_details?.rate ?? 0,
  }));
  // Who publishes where is only known per exchange: ask the busiest few.
  const busy = exchanges
    .filter((e) => e.name !== "" && (e.rate ?? 0) > 0)
    .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))
    .slice(0, 8);
  const seen = await Promise.all(
    busy.map((e) =>
      api
        .get<Incoming>(withQuery(paths.exchange(vhost, e.name), { columns: "name,incoming" }))
        .then((d) => (d.incoming ?? []).map((i) => ({ name: (i.channel_details?.connection_name ?? i.channel_details?.name ?? "").replace(/ -> .*$/, ""), exchange: e.name })))
        .catch(() => []),
    ),
  );
  const publishers = new Map<string, { name: string; exchange: string }>();
  for (const p of seen.flat()) if (p.name) publishers.set(`${p.name}>${p.exchange}`, p);
  const consumers = new Map<string, { name: string; queue: string }>();
  for (const c of cons) {
    // "client:port -> server:port" without the server half; names the user gave stay whole.
    const name = (c.channel_details?.connection_name ?? c.channel_details?.name)?.replace(/ -> .*$/, "");
    if (name) consumers.set(`${name}>${c.queue.name}`, { name, queue: c.queue.name });
  }
  return {
    exchanges,
    queues: itemsOf(qs),
    bindings: bindings,
    publishers: [...publishers.values()],
    consumers: [...consumers.values()],
    queuesTotal: totalOf(qs),
  };
}

interface Counts {
  messages: number;
  consumers: number;
}

const STYLE = `
.tsvg .tn rect{fill:var(--t-panel);stroke:var(--t-line);stroke-width:1}
.tsvg .tn .t1{fill:var(--t-fg);font:500 12px var(--font-mono,monospace)}
.tsvg .tn .t2{fill:var(--t-fg-3);font:400 10.5px var(--font-sans,sans-serif)}
.tsvg .tn{cursor:pointer;transition:opacity .15s}
.tsvg .tn:hover rect{stroke:var(--t-field-line)}
.tsvg .tn:focus-visible rect{stroke:var(--t-accent)}
.tsvg .tn.sel rect{stroke:var(--t-accent);stroke-width:1.5}
.tsvg .tn.hl rect{fill:color-mix(in srgb,var(--t-accent) 14%,var(--t-panel));stroke:var(--t-accent)}
.tsvg .tn.missing rect{stroke:var(--t-danger);stroke-dasharray:4 3;fill:transparent}
.tsvg .tn .crit{fill:var(--t-danger)} .tsvg .tn .warn{fill:var(--t-warn)}
.tsvg .colh{fill:var(--t-fg-3);font:500 11px var(--font-sans,sans-serif)}
.tsvg .ed{fill:none;stroke:var(--t-field-line);stroke-width:1.25;transition:opacity .15s}
.tsvg .ed.dlx{stroke-dasharray:4 4;stroke:var(--t-warn);opacity:.8}
.tsvg .ed.broken{stroke:var(--t-danger);stroke-dasharray:2 4}
.tsvg .ed.hl{stroke:var(--t-accent);stroke-width:2;opacity:1}
.tsvg .elg rect{fill:var(--t-editor);stroke:var(--t-line);stroke-width:1}
.tsvg .elg text{fill:var(--t-fg-2);font:400 10.5px var(--font-mono,monospace)}
.tsvg .elg.hl rect{stroke:color-mix(in srgb,var(--t-accent) 55%,var(--t-line))}
.tsvg .elg.hl text{fill:var(--t-accent-text)}
.tsvg .elg.dlx rect{stroke:var(--t-warn)} .tsvg .elg.broken rect{stroke:var(--t-danger)}
.tsvg.dim .tn:not(.hl){opacity:.45}
.tsvg.dim .ed:not(.hl){opacity:.22}
.tsvg.dim .elg:not(.hl){opacity:.5}
`;

type Badge = "crit" | "warn" | null;

const Node = memo(function Node({
  n,
  sub,
  badge,
  hl,
  selected,
  onEnter,
  onLeave,
  onSelect,
  onOpen,
}: {
  n: LNode;
  sub: string;
  badge: Badge;
  hl: boolean;
  selected: boolean;
  onEnter: (id: string) => void;
  onLeave: () => void;
  onSelect: (id: string) => void;
  onOpen: (n: LNode) => void;
}) {
  return (
    <g
      className={cn("tn", hl && "hl", selected && "sel", n.missing && "missing")}
      transform={`translate(${n.x},${n.y})`}
      tabIndex={0}
      role="button"
      aria-label={`${n.name}, ${sub}`}
      onPointerEnter={() => onEnter(n.id)}
      onPointerLeave={onLeave}
      onFocus={() => onEnter(n.id)}
      onBlur={onLeave}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(n.id);
      }}
      onDoubleClick={() => onOpen(n)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect(n.id);
      }}
    >
      <title>{`${n.name || "(default)"}\n${sub}`}</title>
      <rect width={NODE_W} height={NODE_H} rx={6} />
      {badge && <circle className={badge} cx={NODE_W - 11} cy={11} r={3.5} />}
      <text className="t1" x={10} y={16}>
        {n.name.length > 21 ? `${n.name.slice(0, 20)}…` : n.name}
      </text>
      <text className="t2" x={10} y={30}>
        {sub}
      </text>
    </g>
  );
});

const Edge = memo(function Edge({ e, hl }: { e: LEdge; hl: boolean }) {
  return <path className={cn("ed", e.kind === "dlx" && "dlx", e.kind === "broken" && "broken", hl && "hl")} d={e.d} />;
});

const Pill = memo(function Pill({ e, hl }: { e: LEdge; hl: boolean }) {
  return (
    <g className={cn("elg", e.kind === "dlx" && "dlx", e.kind === "broken" && "broken", hl && "hl")}>
      <rect x={e.lx} y={e.ly} width={e.lw} height={15} rx={3} />
      <text x={e.lx + 5} y={e.ly + 11}>
        {e.label}
      </text>
    </g>
  );
});

function Graph({
  layout,
  vhost,
  counts,
  hl,
  selected,
  onEnter,
  onLeave,
  onSelect,
  onOpen,
}: {
  layout: Layout;
  vhost: string;
  counts: Map<string, Counts>;
  hl: { nodes: Set<string>; edges: Set<string> } | null;
  selected: string | null;
  onEnter: (id: string) => void;
  onLeave: () => void;
  onSelect: (id: string) => void;
  onOpen: (n: LNode) => void;
}) {
  return (
    <svg
      className={cn("tsvg", hl && "dim")}
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label={`Topology of vhost ${vhost}`}
    >
      <style>{STYLE}</style>
      {layout.headers.map((h, i) => (
        <text key={i} className="colh" x={h.x} y={20}>
          {h.text}
        </text>
      ))}
      {layout.edges.map((e) => (
        <Edge key={e.id} e={e} hl={!!hl?.edges.has(e.id)} />
      ))}
      {layout.nodes.map((n) => {
        const c = n.kind === "q" ? counts.get(n.name) : undefined;
        return (
          <Node
            key={n.id}
            n={n}
            sub={nodeSub(n, c)}
            badge={nodeBadge(n, c)}
            hl={!!hl?.nodes.has(n.id)}
            selected={selected === n.id}
            onEnter={onEnter}
            onLeave={onLeave}
            onSelect={onSelect}
            onOpen={onOpen}
          />
        );
      })}
      {layout.edges.map((e) => (e.label ? <Pill key={e.id} e={e} hl={!!hl?.edges.has(e.id)} /> : null))}
    </svg>
  );
}

function nodeSub(n: LNode, c: Counts | undefined): string {
  switch (n.kind) {
    case "p":
      return "publisher";
    case "c":
      return "consumer";
    case "x":
      return n.missing ? "missing exchange" : `${n.type ?? "exchange"}${n.system ? " · built-in" : ""}`;
    default:
      return `${n.type ?? "classic"}${n.dlq ? " · dead letter" : ""} · ${c ? `${compact(c.messages)} msgs` : "…"}`;
  }
}

/** Problems: a backlog nobody consumes, dead letters piling up, a dead-letter target that does not exist. */
function nodeBadge(n: LNode, c: Counts | undefined): Badge {
  if (n.missing) return "crit";
  if (n.kind !== "q" || !c || c.messages <= 0) return null;
  if (n.dlq) return "warn";
  return c.consumers === 0 && n.type !== "stream" ? "crit" : null;
}

export default function TopologyView({ tab, shown }: ViewProps) {
  const connectionId = tab.connection?.id ?? null;
  if (!connectionId) return <EmptyState title="No connection">This tab is not on a connection.</EmptyState>;
  return <Body connectionId={connectionId} initialVhost={tab.vhost} focus={tab.focus} shown={shown} />;
}

function Body({ connectionId, initialVhost, focus, shown }: { connectionId: string; initialVhost: string | null; focus: string | null; shown: boolean }) {
  const [picked, setPicked] = useState<string | null>(initialVhost);
  const [showSystem, setShowSystem] = useState(false);
  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(focus ? nodeId("x", focus) : null);
  const [traceEx, setTraceEx] = useState(focus ?? "");
  const [traceKey, setTraceKey] = useState("");
  const [trace, setTrace] = useState<{ ex: string; rk: string } | null>(null);

  const vhosts = useLive<Pick<VHost, "name">[]>(
    `${connectionId}:topology:vhosts`,
    () => rabbit(connectionId).get(withQuery(paths.vhosts, { columns: "name" })),
    { interval: SLOW, enabled: shown },
  );
  // Without a vhost asked for: the first one that has queues.
  const sample = useLive<Paged<{ vhost: string }>>(
    picked == null ? `${connectionId}:topology:sample` : null,
    () => rabbit(connectionId).get(withQuery(paths.queues(), { columns: "vhost", page: 1, page_size: PAGE })),
    { interval: 0, enabled: shown },
  );
  const vhost = useMemo(() => {
    if (picked != null) return picked;
    const names = vhosts.data?.map((v) => v.name);
    if (!names?.length) return null;
    if (!sample.data) return sample.error ? names[0] : null;
    const used = new Set(itemsOf(sample.data).map((q) => q.vhost));
    return names.find((n) => used.has(n)) ?? names[0];
  }, [picked, vhosts.data, sample.data, sample.error]);

  const data = useLive<Loaded>(vhost == null ? null : `${connectionId}:topology:${vhost}`, () => load(connectionId, vhost!), {
    interval: SLOW,
    enabled: shown,
  });
  const live = useLive<Paged<Pick<Queue, "name" | "messages" | "consumers">>>(
    vhost == null ? null : `${connectionId}:topology:${vhost}:counts`,
    () => rabbit(connectionId).get(withQuery(paths.queues(vhost!), { columns: "name,messages,consumers", page: 1, page_size: PAGE })),
    { enabled: shown },
  );
  const counts = useMemo(() => {
    const m = new Map<string, Counts>();
    if (live.data) for (const q of itemsOf(live.data)) m.set(q.name, { messages: q.messages ?? 0, consumers: q.consumers ?? 0 });
    return m;
  }, [live.data]);

  const layout = useMemo(
    () => (data.data ? buildLayout(data.data, { showSystem, filter: deferredFilter, cap: CAP }) : null),
    [data.data, showSystem, deferredFilter],
  );

  const reached = useMemo(
    () => (trace && data.data ? route(trace.ex, trace.rk, {}, data.data.bindings as Binding[], data.data.exchanges) : null),
    [trace, data.data],
  );

  const traceHl = useMemo(() => {
    if (!trace || !reached || !layout) return null;
    const nodes = new Set([nodeId("x", trace.ex)]);
    const edges = new Set<string>();
    for (const r of reached) {
      for (const b of r.via) {
        const from = nodeId("x", b.source);
        const to = nodeId(b.destination_type === "queue" ? "q" : "x", b.destination);
        nodes.add(from);
        nodes.add(to);
        edges.add(`e:${from}>${to}`);
      }
    }
    for (const e of layout.edges) {
      if ((e.kind === "pub" && nodes.has(e.to)) || (e.kind === "consume" && nodes.has(e.from))) {
        edges.add(e.id);
        nodes.add(e.kind === "pub" ? e.from : e.to);
      }
    }
    return { nodes, edges };
  }, [trace, reached, layout]);

  const focusId = hover ?? selected;
  const focusHl = useMemo(() => (focusId && layout?.nodes.some((n) => n.id === focusId) ? pathsThrough(layout, focusId) : null), [layout, focusId]);
  const hl = focusHl ?? traceHl;

  const onEnter = useCallback((id: string) => setHover(id), []);
  const onLeave = useCallback(() => setHover(null), []);
  const onSelect = useCallback((id: string) => setSelected((s) => (s === id ? null : id)), []);
  const onOpen = useCallback(
    (n: LNode) => {
      if (n.kind === "q") openOn(connectionId, { kind: "queue", vhost, name: n.name });
      else if (n.kind === "x" && !n.missing) openOn(connectionId, { kind: "exchange", vhost, name: n.name });
    },
    [connectionId, vhost],
  );
  const onBackground = useCallback(() => setSelected(null), []);

  const exchangeTypes = useMemo(() => new Map((data.data?.exchanges ?? []).map((e) => [e.name, e.type])), [data.data]);
  const exchangeNames = useMemo(() => (data.data?.exchanges ?? []).filter((e) => e.name !== "").map((e) => e.name).sort(), [data.data]);
  const exchangeDefault = traceEx && exchangeNames.includes(traceEx) ? traceEx : (exchangeNames.find((n) => !n.startsWith("amq.")) ?? exchangeNames[0] ?? "");

  if (vhosts.error && !vhosts.data) return <ErrorState error={vhosts.error} onRetry={() => void vhosts.refresh()} />;
  if (!vhosts.data) return <Loading />;
  if (vhosts.data.length === 0) return <EmptyState title="No virtual hosts" />;

  const selectedNode = selected ? layout?.nodes.find((n) => n.id === selected) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-editor">
      <ViewToolbar>
        <label className="flex items-center gap-2 text-sm text-fg-2">
          Virtual host
          <select
            value={vhost ?? ""}
            onChange={(e) => {
              setPicked(e.target.value);
              setSelected(null);
              setTrace(null);
            }}
            aria-label="Virtual host"
            className="h-7 rounded-sm border border-field-line bg-field px-1.5 font-mono text-[12.5px] text-fg outline-none focus:border-accent"
          >
            {vhosts.data.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <FilterField value={filter} onChange={setFilter} placeholder="Filter objects" />
        <label className="flex items-center gap-2 text-sm text-fg-2">
          <Switch size="sm" checked={showSystem} onCheckedChange={setShowSystem} aria-label="Show system exchanges" />
          System exchanges
        </label>
        <Spacer />
        {layout && (
          <span className="text-sm text-fg-3">
            {layout.shown} {layout.shown === 1 ? "object" : "objects"}
          </span>
        )}
      </ViewToolbar>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
        <label className="flex h-7 w-[240px] min-w-0 items-center gap-2 rounded-sm border border-field-line bg-field px-2 focus-within:border-accent">
          <span className="shrink-0 text-xs text-fg-3">exchange</span>
          <select
            value={exchangeDefault}
            onChange={(e) => setTraceEx(e.target.value)}
            aria-label="Exchange to trace"
            className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-fg outline-none"
          >
            {exchangeNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-7 min-w-[160px] flex-1 items-center gap-2 rounded-sm border border-field-line bg-field px-2 focus-within:border-accent">
          <span className="shrink-0 text-xs text-fg-3">routing key</span>
          <input
            value={traceKey}
            onChange={(e) => setTraceKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && exchangeDefault) setTrace({ ex: exchangeDefault, rk: traceKey });
            }}
            spellCheck={false}
            aria-label="Routing key to trace"
            className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-fg outline-none"
          />
        </label>
        <Button variant="primary" disabled={!exchangeDefault} onClick={() => setTrace({ ex: exchangeDefault, rk: traceKey })}>
          <RouteIcon />
          Trace a message
        </Button>
        {trace && (
          <Button variant="ghost" onClick={() => setTrace(null)}>
            Clear
          </Button>
        )}
      </div>
      {trace && reached && (
        <div className="shrink-0 border-b border-line px-3 py-1.5 text-sm text-fg-2">
          {reached.length ? (
            <>
              Routes to <b className="font-medium text-fg">{reached.length}</b> {reached.length === 1 ? "queue" : "queues"}:{" "}
              <span className="font-mono text-[12px] text-fg">{reached.map((r) => r.queue).join(", ")}</span>
            </>
          ) : (
            <span className="text-warn">No queue matches; the message would be dropped.</span>
          )}
        </div>
      )}
      {layout && layout.shown < layout.total && (
        <Notice tone="info">
          Showing <b>{layout.shown}</b> of <b>{layout.total}</b> objects, the best connected first. Filter to narrow it down.
        </Notice>
      )}
      {data.data && data.data.queuesTotal > PAGE && (
        <Notice tone="warn">
          The vhost has <b>{data.data.queuesTotal}</b> queues; only the first {PAGE} are read.
        </Notice>
      )}

      <div className="flex min-h-0 flex-1">
        {data.error && !data.data ? (
          <ErrorState error={data.error} onRetry={() => void data.refresh()} />
        ) : !layout ? (
          <Loading />
        ) : layout.nodes.length === 0 ? (
          <EmptyState icon={Split} title="Nothing to draw">
            {filter ? "No exchange or queue matches the filter." : "This virtual host has no exchanges or queues yet."}
          </EmptyState>
        ) : (
          <PanZoom width={layout.width} height={layout.height} fitKey={vhost ?? ""} onBackgroundClick={onBackground}>
            <Graph
              layout={layout}
              vhost={vhost ?? ""}
              counts={counts}
              hl={hl}
              selected={selected}
              onEnter={onEnter}
              onLeave={onLeave}
              onSelect={onSelect}
              onOpen={onOpen}
            />
          </PanZoom>
        )}
        <Inspector
          label="Selection"
          title={selectedNode ? selectedNode.name || "(default)" : trace ? "Route" : "Topology"}
          subtitle={selectedNode ? nodeSub(selectedNode, counts.get(selectedNode.name)) : trace ? `${trace.ex} · ${trace.rk || '""'}` : vhost}
          actions={
            selectedNode && (selectedNode.kind === "q" || (selectedNode.kind === "x" && !selectedNode.missing)) ? (
              <Button size="sm" onClick={() => onOpen(selectedNode)}>
                Open
                <ArrowUpRight />
              </Button>
            ) : undefined
          }
        >
          {selectedNode && data.data ? (
            <NodeDetails
              node={selectedNode}
              data={data.data}
              counts={counts}
              onTrace={(ex) => {
                setTraceEx(ex);
                setSelected(null);
              }}
              onPublish={(ex) => openOn(connectionId, { kind: "exchange", vhost, name: ex, view: "publish" })}
              onOpenQueue={(q) => openOn(connectionId, { kind: "queue", vhost, name: q })}
              onOpenExchange={(x) => openOn(connectionId, { kind: "exchange", vhost, name: x })}
            />
          ) : (
            <div className="px-3 py-2 text-sm text-fg-3">
              {trace && reached ? (
                <ul className="-mx-3 mb-2">
                  {reached.map((r) => (
                    <li key={r.queue} className="flex h-[26px] items-center gap-2 px-3 font-mono text-[12px] text-fg">
                      <Inbox className="size-3.5 shrink-0 text-fg-3" aria-hidden />
                      <span className="truncate">{r.queue}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-fg-3">{r.via.map((b) => bindingLabel(b, exchangeTypes.get(b.source))).join(" → ")}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              Dashed amber lines are dead-lettering: where a queue sends rejected or expired messages. Dashed red lines point to an exchange that does not
              exist. Click a node to inspect it; hover to trace its path.
            </div>
          )}
        </Inspector>
      </div>
    </div>
  );
}

function BindingList({ rows }: { rows: { key: string; text: string; go?: () => void }[] }) {
  if (!rows.length) return <div className="px-3 pb-2 text-sm text-fg-3">None.</div>;
  return (
    <ul className="pb-1">
      {rows.slice(0, 50).map((r) => (
        <li key={r.key} className="flex h-6 items-center px-3 font-mono text-[12px]">
          {r.go ? (
            <button type="button" className="truncate text-left text-fg hover:text-accent-text hover:underline" onClick={r.go}>
              {r.text}
            </button>
          ) : (
            <span className="truncate">{r.text}</span>
          )}
        </li>
      ))}
      {rows.length > 50 && <li className="px-3 text-xs text-fg-3">and {rows.length - 50} more</li>}
    </ul>
  );
}

function NodeDetails({
  node,
  data,
  counts,
  onTrace,
  onPublish,
  onOpenQueue,
  onOpenExchange,
}: {
  node: LNode;
  data: Loaded;
  counts: Map<string, Counts>;
  onTrace: (exchange: string) => void;
  onPublish: (exchange: string) => void;
  onOpenQueue: (q: string) => void;
  onOpenExchange: (x: string) => void;
}) {
  const key = (b: Binding | Loaded["bindings"][number]) => `${b.source}|${b.destination_type}|${b.destination}|${b.properties_key}`;
  const label = (b: Loaded["bindings"][number]) => (b.routing_key === "" ? (Object.keys(b.arguments ?? {}).length ? JSON.stringify(b.arguments) : '""') : b.routing_key);

  if (node.kind === "q") {
    const q = data.queues.find((x) => x.name === node.name);
    const c = counts.get(node.name);
    const dl = q ? deadLetter(q) : null;
    const into = data.bindings.filter((b) => b.destination_type === "queue" && b.destination === node.name && b.source !== "");
    const tone = c && c.messages > 0 && c.consumers === 0 && !node.dlq ? "crit" : node.dlq && c && c.messages > 0 ? "warn" : "ok";
    return (
      <>
        <div className="px-3 pt-2">
          <StateLabel tone={tone}>
            {tone === "crit" ? "Backlog, no consumers" : tone === "warn" ? "Dead letters waiting" : "Healthy"}
          </StateLabel>
        </div>
        <KeyValues
          rows={[
            ["type", node.type ?? "classic"],
            ["messages", c ? compact(c.messages) : "…"],
            ["consumers", c ? c.consumers : "…"],
            ["policy", q?.policy ?? "none"],
            ["dead letter", dl ? `${dl.exchange || "(default)"}${dl.routingKey ? ` (${dl.routingKey})` : ""}` : "none"],
          ]}
        />
        <SectionHeader>Bindings</SectionHeader>
        <BindingList rows={into.map((b) => ({ key: key(b), text: `${b.source} ← ${label(b)}`, go: () => onOpenExchange(b.source) }))} />
      </>
    );
  }
  if (node.kind === "x" && !node.missing) {
    const from = data.bindings.filter((b) => b.source === node.name);
    const into = data.bindings.filter((b) => b.destination_type === "exchange" && b.destination === node.name);
    return (
      <>
        <KeyValues rows={[["type", node.type ?? ""], ["policy", data.exchanges.find((e) => e.name === node.name)?.policy ?? "none"], ["bindings out", from.length], ["bindings in", into.length]]} />
        <div className="flex gap-2 px-3 pb-2">
          <Button size="sm" onClick={() => onTrace(node.name)}>
            <RouteIcon />
            Trace from here
          </Button>
          <Button size="sm" onClick={() => onPublish(node.name)}>
            Publish
          </Button>
        </div>
        <SectionHeader>Bindings out</SectionHeader>
        <BindingList
          rows={from.map((b) => ({
            key: key(b),
            text: `→ ${b.destination} on ${label(b)}`,
            go: () => (b.destination_type === "queue" ? onOpenQueue(b.destination) : onOpenExchange(b.destination)),
          }))}
        />
        <SectionHeader>Bindings in</SectionHeader>
        <BindingList rows={into.map((b) => ({ key: key(b), text: `${b.source} → on ${label(b)}`, go: () => onOpenExchange(b.source) }))} />
      </>
    );
  }
  if (node.missing) {
    const from = data.queues.filter((q) => deadLetter(q)?.exchange === node.name);
    return (
      <>
        <div className="px-3 pt-2 text-sm text-fg-2">
          No exchange named <span className="font-mono text-fg">{node.name}</span> exists, so these queues dead-letter into the void.
        </div>
        <SectionHeader>Dead-lettering queues</SectionHeader>
        <BindingList rows={from.map((q) => ({ key: q.name, text: q.name, go: () => onOpenQueue(q.name) }))} />
      </>
    );
  }
  const links = node.kind === "p" ? data.publishers.filter((p) => p.name === node.name) : data.consumers.filter((c) => c.name === node.name);
  return (
    <>
      <div className="px-3 pt-2 text-sm text-fg-2">A connection seen {node.kind === "p" ? "publishing" : "consuming"} in this vhost.</div>
      <SectionHeader>{node.kind === "p" ? "Publishes to" : "Consumes from"}</SectionHeader>
      <BindingList
        rows={links.map((l) => {
          const target = "exchange" in l ? l.exchange : l.queue;
          return { key: target, text: target, go: () => ("exchange" in l ? onOpenExchange(target) : onOpenQueue(target)) };
        })}
      />
    </>
  );
}
