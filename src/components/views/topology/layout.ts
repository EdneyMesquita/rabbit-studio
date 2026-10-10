import type { Binding } from "@/types/rabbit";
import { bindingLabel } from "../publish/routing";

/**
 * The topology graph of one vhost as plain geometry: layered columns
 * (publishers, exchanges, exchange-to-exchange layers, queues, consumers),
 * nodes ordered to untangle the edges, and every edge's path and label
 * position. Pure, so the view only draws it and it is cheap to test.
 */

export interface TExchange {
  name: string;
  type: string;
  internal?: boolean;
  policy?: string | null;
}

export interface TQueue {
  name: string;
  type?: string;
  arguments?: Record<string, unknown>;
  effective_policy_definition?: Record<string, unknown>;
  policy?: string | null;
}

export type TBinding = Pick<Binding, "source" | "destination" | "destination_type" | "routing_key" | "arguments" | "properties_key">;

export interface TopologyData {
  exchanges: TExchange[];
  queues: TQueue[];
  bindings: TBinding[];
  /** Connections seen publishing into an exchange. */
  publishers: { name: string; exchange: string }[];
  /** Connections consuming from a queue. */
  consumers: { name: string; queue: string }[];
}

export interface LayoutOptions {
  /** Show amq.* exchanges. */
  showSystem: boolean;
  /** Keeps the nodes whose name contains this, and their neighbours. */
  filter: string;
  /** Most nodes drawn; the best connected win. */
  cap: number;
}

export type NodeKind = "p" | "x" | "q" | "c";
export type EdgeKind = "bind" | "e2e" | "pub" | "consume" | "dlx" | "broken";

export interface LNode {
  id: string;
  kind: NodeKind;
  /** The object's name. */
  name: string;
  /** Exchange or queue type. */
  type?: string;
  x: number;
  y: number;
  /** A dead-letter target that no exchange answers to. */
  missing?: boolean;
  /** A queue that dead-lettered messages arrive in. */
  dlq?: boolean;
  system?: boolean;
}

export interface LEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  d: string;
  label?: string;
  lx: number;
  ly: number;
  lw: number;
  /** The bindings this edge stands for (one per routing key). */
  bindings: TBinding[];
}

export interface Layout {
  nodes: LNode[];
  edges: LEdge[];
  headers: { x: number; text: string }[];
  width: number;
  height: number;
  /** Objects before the cap and filter, and how many are drawn. */
  total: number;
  shown: number;
}

export const NODE_W = 172;
export const NODE_H = 38;
const GAP = 12;
const MARGIN = 16;
const HEAD = 36;

export const nodeId = (kind: NodeKind, name: string) => `${kind}:${name}`;

/** The queue's dead-letter exchange: its own argument wins over the policy's. */
export function deadLetter(q: TQueue): { exchange: string; routingKey?: string } | null {
  const arg = q.arguments?.["x-dead-letter-exchange"];
  const pol = q.effective_policy_definition?.["dead-letter-exchange"];
  const exchange = typeof arg === "string" ? arg : typeof pol === "string" ? pol : null;
  if (!exchange) return null;
  const rkArg = q.arguments?.["x-dead-letter-routing-key"];
  const rkPol = q.effective_policy_definition?.["dead-letter-routing-key"];
  const routingKey = typeof rkArg === "string" ? rkArg : typeof rkPol === "string" ? rkPol : undefined;
  return { exchange, routingKey };
}

const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function bezier(t: number, p0: number, p1: number, p2: number, p3: number) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

interface RawEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  bindings: TBinding[];
}

export function buildLayout(data: TopologyData, options: LayoutOptions): Layout {
  const exchangeType = new Map(data.exchanges.map((e) => [e.name, e.type]));
  const nodes = new Map<string, LNode>();
  const add = (n: Omit<LNode, "x" | "y">) => {
    if (!nodes.has(n.id)) nodes.set(n.id, { ...n, x: 0, y: 0 });
  };

  for (const e of data.exchanges) {
    if (e.name === "") continue; // the default exchange is implicit everywhere
    const system = e.name.startsWith("amq.");
    if (system && !options.showSystem) continue;
    add({ id: nodeId("x", e.name), kind: "x", name: e.name, type: e.type, system });
  }
  for (const q of data.queues) add({ id: nodeId("q", q.name), kind: "q", name: q.name, type: q.type });

  const raw: RawEdge[] = [];
  const pair = new Map<string, RawEdge>();
  for (const b of data.bindings) {
    if (b.source === "") continue;
    const from = nodeId("x", b.source);
    const to = nodeId(b.destination_type === "queue" ? "q" : "x", b.destination);
    if (!nodes.has(from) || !nodes.has(to)) continue;
    const key = `${from}>${to}`;
    const existing = pair.get(key);
    if (existing) existing.bindings.push(b);
    else {
      const e: RawEdge = { from, to, kind: b.destination_type === "queue" ? "bind" : "e2e", bindings: [b] };
      pair.set(key, e);
      raw.push(e);
    }
  }
  for (const e of pair.values()) {
    const first = e.bindings[0];
    const text = bindingLabel(first, exchangeType.get(first.source));
    e.label = e.bindings.length > 1 ? `${text} +${e.bindings.length - 1}` : text;
  }

  // Dead-lettering: a queue's messages continue in another exchange.
  const dlxTargets = new Set<string>();
  for (const q of data.queues) {
    const dl = deadLetter(q);
    if (!dl || dl.exchange === "") continue;
    const from = nodeId("q", q.name);
    const to = nodeId("x", dl.exchange);
    if (exchangeType.has(dl.exchange)) {
      if (!nodes.has(to)) continue; // a hidden system exchange
      dlxTargets.add(dl.exchange);
      raw.push({ from, to, kind: "dlx", label: dl.routingKey, bindings: [] });
    } else {
      add({ id: to, kind: "x", name: dl.exchange, missing: true });
      raw.push({ from, to, kind: "broken", label: dl.routingKey, bindings: [] });
    }
  }
  // Queues the dead letters land in.
  for (const e of raw) {
    if (e.kind !== "bind") continue;
    const src = e.bindings[0].source;
    if (dlxTargets.has(src)) {
      const q = nodes.get(e.to);
      if (q) q.dlq = true;
    }
  }

  for (const p of data.publishers) {
    const to = nodeId("x", p.exchange);
    if (!nodes.has(to)) continue;
    const from = nodeId("p", p.name);
    add({ id: from, kind: "p", name: p.name });
    raw.push({ from, to, kind: "pub", bindings: [] });
  }
  for (const c of data.consumers) {
    const from = nodeId("q", c.queue);
    if (!nodes.has(from)) continue;
    const to = nodeId("c", c.name);
    add({ id: to, kind: "c", name: c.name });
    if (!raw.some((e) => e.kind === "consume" && e.from === from && e.to === to)) raw.push({ from, to, kind: "consume", bindings: [] });
  }

  // Filter, then cap.
  const total = nodes.size;
  let keep = new Set(nodes.keys());
  const needle = options.filter.trim().toLowerCase();
  if (needle) {
    const hit = new Set<string>();
    for (const n of nodes.values()) if (n.name.toLowerCase().includes(needle)) hit.add(n.id);
    keep = new Set(hit);
    for (const e of raw) {
      if (hit.has(e.from)) keep.add(e.to);
      if (hit.has(e.to)) keep.add(e.from);
    }
  }
  if (keep.size > options.cap) {
    const degree = new Map<string, number>();
    for (const e of raw) {
      if (!keep.has(e.from) || !keep.has(e.to)) continue;
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    const ranked = [...keep].sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || a.localeCompare(b));
    keep = new Set(ranked.slice(0, options.cap));
  }
  const edgesIn = raw.filter((e) => keep.has(e.from) && keep.has(e.to));
  const linked = new Set<string>();
  for (const e of edgesIn) {
    linked.add(e.from);
    linked.add(e.to);
  }
  // Publishers, consumers and ghost nodes only exist for their edges.
  const drawn = [...keep].map((id) => nodes.get(id)!).filter((n) => (n.kind === "p" || n.kind === "c" || n.missing ? linked.has(n.id) : true));

  // Exchange layers: an exchange sits right of the exchanges that feed it.
  const exchanges = drawn.filter((n) => n.kind === "x");
  const layer = new Map(exchanges.map((n) => [n.id, 0]));
  const e2e = edgesIn.filter((e) => e.kind === "e2e");
  for (let pass = 0; pass < exchanges.length; pass++) {
    let changed = false;
    for (const e of e2e) {
      if (e.from === e.to) continue;
      const want = (layer.get(e.from) ?? 0) + 1;
      if (want > (layer.get(e.to) ?? 0) && want <= exchanges.length) {
        layer.set(e.to, want);
        changed = true;
      }
    }
    if (!changed) break;
  }

  type Column = { key: string; title: string; kind: NodeKind; nodes: LNode[] };
  const columns: Column[] = [];
  const byName = (a: LNode, b: LNode) => a.name.localeCompare(b.name);
  const pubs = drawn.filter((n) => n.kind === "p").sort(byName);
  if (pubs.length) columns.push({ key: "p", title: "Publishers", kind: "p", nodes: pubs });
  const maxLayer = Math.max(0, ...layer.values());
  for (let l = 0; l <= maxLayer; l++) {
    const xs = exchanges.filter((n) => layer.get(n.id) === l).sort(byName);
    if (xs.length) columns.push({ key: `x${l}`, title: l === 0 ? "Exchanges" : "Via exchanges", kind: "x", nodes: xs });
  }
  const qs = drawn.filter((n) => n.kind === "q").sort(byName);
  if (qs.length) columns.push({ key: "q", title: "Queues", kind: "q", nodes: qs });
  const cs = drawn.filter((n) => n.kind === "c").sort(byName);
  if (cs.length) columns.push({ key: "c", title: "Consumers", kind: "c", nodes: cs });

  // Order within columns by the average height of the neighbours, a few sweeps.
  const colOf = new Map<string, number>();
  columns.forEach((c, i) => c.nodes.forEach((n) => colOf.set(n.id, i)));
  const neighbours = new Map<string, string[]>();
  for (const e of edgesIn) {
    if (e.kind === "dlx" || e.kind === "broken") continue;
    (neighbours.get(e.from) ?? neighbours.set(e.from, []).get(e.from)!).push(e.to);
    (neighbours.get(e.to) ?? neighbours.set(e.to, []).get(e.to)!).push(e.from);
  }
  const index = new Map<string, number>();
  const reindex = () => columns.forEach((c) => c.nodes.forEach((n, i) => index.set(n.id, i / Math.max(1, c.nodes.length - 1))));
  reindex();
  const sweep = (i: number, towards: number) => {
    const c = columns[i];
    const score = new Map<string, number>();
    for (const n of c.nodes) {
      const ns = (neighbours.get(n.id) ?? []).filter((id) => (colOf.get(id) ?? i) * towards < i * towards);
      score.set(n.id, ns.length ? ns.reduce((s, id) => s + (index.get(id) ?? 0), 0) / ns.length : (index.get(n.id) ?? 0));
    }
    c.nodes.sort((a, b) => score.get(a.id)! - score.get(b.id)! || a.name.localeCompare(b.name));
    reindex();
  };
  for (let round = 0; round < 3; round++) {
    for (let i = 1; i < columns.length; i++) sweep(i, 1);
    for (let i = columns.length - 2; i >= 0; i--) sweep(i, -1);
  }

  // Positions: columns centred on the tallest one; room for labels where edges carry them.
  const rows = Math.max(1, ...columns.map((c) => c.nodes.length));
  const gapAfter = (a: Column, b: Column) => (b.kind === "x" ? (a.kind === "p" ? 70 : 150) : a.kind === "x" ? 170 : 70);
  let x = MARGIN;
  const headers: Layout["headers"] = [];
  columns.forEach((c, i) => {
    if (i > 0) x += gapAfter(columns[i - 1], c);
    headers.push({ x, text: c.title });
    c.nodes.forEach((n, j) => {
      n.x = x;
      n.y = HEAD + ((rows - c.nodes.length) * (NODE_H + GAP)) / 2 + j * (NODE_H + GAP);
    });
    x += NODE_W;
  });
  const width = x + MARGIN;
  const height = HEAD + rows * (NODE_H + GAP) + 12;

  const placed = new Map(drawn.map((n) => [n.id, n]));
  const edges: LEdge[] = edgesIn.map((e, i) => {
    const a = placed.get(e.from)!;
    const b = placed.get(e.to)!;
    let sx: number, sy: number, tx: number, ty: number, c1x: number, c1y: number, c2x: number, c2y: number;
    if (e.kind === "dlx" || e.kind === "broken") {
      // Back to an exchange on the left: loop under the nodes.
      sx = a.x;
      sy = a.y + NODE_H / 2;
      tx = b.x + NODE_W;
      ty = b.y + NODE_H / 2;
      const mx = (sx + tx) / 2;
      c1x = mx;
      c1y = sy + 26;
      c2x = mx;
      c2y = ty + 26;
    } else {
      sx = a.x + NODE_W;
      sy = a.y + NODE_H / 2;
      tx = b.x;
      ty = b.y + NODE_H / 2;
      const mx = (sx + tx) / 2;
      c1x = mx;
      c1y = sy;
      c2x = mx;
      c2y = ty;
    }
    const text = e.label ? trunc(e.label, 24) : undefined;
    const lw = text ? text.length * 6.4 + 10 : 0;
    // Pills sit near the target end, on the curve, so edges into one node don't share a spot.
    const lx = bezier(0.72, sx, c1x, c2x, tx) - lw / 2;
    const ly = bezier(0.72, sy, c1y, c2y, ty) - 7.5;
    return {
      id: e.kind === "bind" || e.kind === "e2e" ? `e:${e.from}>${e.to}` : `${e.kind}:${e.from}>${e.to}#${i}`,
      from: e.from,
      to: e.to,
      kind: e.kind,
      d: `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`,
      label: text,
      lx,
      ly,
      lw,
      bindings: e.bindings,
    };
  });

  return { nodes: drawn, edges, headers, width, height, total, shown: drawn.length };
}

/** Every node and edge upstream and downstream of one node (dead letters included). */
export function pathsThrough(layout: Layout, id: string): { nodes: Set<string>; edges: Set<string> } {
  const outs = new Map<string, LEdge[]>();
  const ins = new Map<string, LEdge[]>();
  for (const e of layout.edges) {
    (outs.get(e.from) ?? outs.set(e.from, []).get(e.from)!).push(e);
    (ins.get(e.to) ?? ins.set(e.to, []).get(e.to)!).push(e);
  }
  const nodes = new Set([id]);
  const edges = new Set<string>();
  const walk = (start: string, next: Map<string, LEdge[]>, far: (e: LEdge) => string) => {
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of next.get(cur) ?? []) {
        edges.add(e.id);
        const f = far(e);
        nodes.add(f);
        if (!seen.has(f)) {
          seen.add(f);
          stack.push(f);
        }
      }
    }
  };
  walk(id, outs, (e) => e.to);
  walk(id, ins, (e) => e.from);
  return { nodes, edges };
}
