import type { Binding, Exchange } from "@/types/rabbit";

/**
 * Where a message published to an exchange would end up, worked out on the
 * client from the bindings: used for the publish preview and the topology
 * trace. Mirrors the broker's rules for direct, fanout, topic and headers
 * exchanges, follows exchange-to-exchange bindings and the default exchange.
 */

/** AMQP topic matching: words split on ".", `*` is one word, `#` zero or more. */
export function topicMatch(pattern: string, key: string): boolean {
  const p = pattern.split(".");
  const k = key.split(".");
  // Memoized on (i, j): a pattern full of `#` stays polynomial.
  const memo = new Map<number, boolean>();
  const go = (i: number, j: number): boolean => {
    const id = i * (k.length + 1) + j;
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    let r: boolean;
    if (i === p.length) r = j === k.length;
    else if (p[i] === "#") {
      r = false;
      for (let x = j; x <= k.length && !r; x++) r = go(i + 1, x);
    } else if (j === k.length) r = false;
    else r = (p[i] === "*" || p[i] === k[j]) && go(i + 1, j + 1);
    memo.set(id, r);
    return r;
  };
  return go(0, 0);
}

function sameValue(a: unknown, b: unknown): boolean {
  return a === b || (typeof a !== "object" && typeof b !== "object" && String(a) === String(b));
}

/**
 * Headers exchange: `x-match` all (default) or any; the `-with-x` variants
 * also compare the binding's own `x-` arguments. A binding with no
 * arguments to compare matches everything under `all`, nothing under `any`.
 */
export function headersMatch(args: Record<string, unknown>, headers: Record<string, unknown>): boolean {
  const mode = String(args["x-match"] ?? "all");
  const withX = mode.endsWith("-with-x");
  const any = mode.startsWith("any");
  let compared = 0;
  let hits = 0;
  for (const [key, want] of Object.entries(args)) {
    if (key === "x-match") continue;
    if (!withX && key.startsWith("x-")) continue;
    compared++;
    if (key in headers && sameValue(headers[key], want)) hits++;
  }
  return any ? hits > 0 : hits === compared;
}

export interface Reached {
  queue: string;
  /** The bindings crossed, in order: exchange to exchange to the queue. */
  via: Binding[];
}

/** The binding's own match against a message, given its exchange's type. */
export function bindingMatches(type: string, b: Binding, routingKey: string, headers: Record<string, unknown>): boolean {
  switch (type) {
    case "fanout":
      return true;
    case "topic":
      return topicMatch(b.routing_key, routingKey);
    case "headers":
      return headersMatch(b.arguments ?? {}, headers);
    default:
      // direct, the default exchange and plugin types (consistent hash...):
      // exact key. Plugin exchanges pick among matches, so this over-reports.
      return b.routing_key === routingKey;
  }
}

/**
 * The queues a message reaches, each with the first path found to it.
 * `exchange` "" is the default exchange: its (implicit) bindings are the
 * queues named after the routing key.
 */
export function route(
  exchange: string,
  routingKey: string,
  headers: Record<string, unknown>,
  bindings: Binding[],
  exchanges: Pick<Exchange, "name" | "type">[],
): Reached[] {
  const types = new Map(exchanges.map((e) => [e.name, e.type]));
  const bySource = new Map<string, Binding[]>();
  for (const b of bindings) {
    const list = bySource.get(b.source);
    if (list) list.push(b);
    else bySource.set(b.source, [b]);
  }
  const out: Reached[] = [];
  const queues = new Set<string>();
  const visit = (name: string, via: Binding[], seen: Set<string>) => {
    const type = name === "" ? "direct" : types.get(name);
    if (!type || seen.has(name)) return;
    const next = new Set(seen).add(name);
    for (const b of bySource.get(name) ?? []) {
      if (!bindingMatches(type, b, routingKey, headers)) continue;
      if (b.destination_type === "exchange") visit(b.destination, [...via, b], next);
      else if (!queues.has(b.destination)) {
        queues.add(b.destination);
        out.push({ queue: b.destination, via: [...via, b] });
      }
    }
  };
  visit(exchange, [], new Set());
  return out;
}

/** What to show for a binding on a route: its key, or the type's own word when the key is ignored. */
export function bindingLabel(b: Pick<Binding, "routing_key">, sourceType: string | undefined): string {
  if (sourceType === "fanout") return "(fanout)";
  if (sourceType === "headers") return "(headers)";
  return b.routing_key === "" ? '""' : b.routing_key;
}
