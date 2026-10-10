import { describe, expect, it } from "vitest";
import { buildLayout, pathsThrough, type TBinding, type TopologyData } from "./layout";

const bind = (source: string, destination: string, routing_key = "", type: "queue" | "exchange" = "queue"): TBinding => ({
  source,
  destination,
  destination_type: type,
  routing_key,
  arguments: {},
  properties_key: routing_key,
});

const base = (): TopologyData => ({
  exchanges: [
    { name: "", type: "direct" },
    { name: "amq.topic", type: "topic" },
    { name: "ev", type: "topic" },
    { name: "fan", type: "fanout" },
    { name: "dlx", type: "fanout" },
  ],
  queues: [
    { name: "paid", arguments: { "x-dead-letter-exchange": "dlx" } },
    { name: "audit", effective_policy_definition: { "dead-letter-exchange": "gone" } },
    { name: "dlq" },
  ],
  bindings: [
    bind("", "paid", "paid"),
    bind("ev", "paid", "order.paid"),
    bind("ev", "paid", "order.refund"),
    bind("ev", "fan", "order.#", "exchange"),
    bind("fan", "audit"),
    bind("dlx", "dlq"),
    bind("amq.topic", "audit", "#"),
  ],
  publishers: [{ name: "api", exchange: "ev" }],
  consumers: [{ name: "worker", queue: "paid" }],
});
const opts = { showSystem: false, filter: "", cap: 300 };

describe("buildLayout", () => {
  it("lays columns left to right: publishers, exchanges, e2e layers, queues, consumers", () => {
    const l = buildLayout(base(), opts);
    const x = (id: string) => l.nodes.find((n) => n.id === id)!.x;
    expect(x("p:api")).toBeLessThan(x("x:ev"));
    expect(x("x:ev")).toBeLessThan(x("x:fan"));
    expect(x("x:fan")).toBeLessThan(x("q:audit"));
    expect(x("q:paid")).toBeLessThan(x("c:worker"));
    expect(l.headers.map((h) => h.text)).toEqual(["Publishers", "Exchanges", "Via exchanges", "Queues", "Consumers"]);
  });
  it("hides the default and amq.* exchanges unless asked", () => {
    expect(buildLayout(base(), opts).nodes.some((n) => n.id === "x:amq.topic" || n.id === "x:")).toBe(false);
    expect(buildLayout(base(), { ...opts, showSystem: true }).nodes.some((n) => n.id === "x:amq.topic")).toBe(true);
  });
  it("merges bindings between one pair into one edge with all keys", () => {
    const e = buildLayout(base(), opts).edges.find((x) => x.id === "e:x:ev>q:paid")!;
    expect(e.bindings).toHaveLength(2);
    expect(e.label).toBe("order.paid +1");
  });
  it("draws dead-letter edges, and broken ones to a missing exchange", () => {
    const l = buildLayout(base(), opts);
    expect(l.edges.some((e) => e.kind === "dlx" && e.from === "q:paid" && e.to === "x:dlx")).toBe(true);
    expect(l.edges.some((e) => e.kind === "broken" && e.to === "x:gone")).toBe(true);
    expect(l.nodes.find((n) => n.id === "x:gone")?.missing).toBe(true);
    expect(l.nodes.find((n) => n.id === "q:dlq")?.dlq).toBe(true);
  });
  it("filters to matches and their neighbours", () => {
    const l = buildLayout(base(), { ...opts, filter: "fan" });
    expect(l.nodes.map((n) => n.id).sort()).toEqual(["q:audit", "x:ev", "x:fan"]);
  });
  it("caps by connectivity and reports it", () => {
    const l = buildLayout(base(), { ...opts, cap: 3 });
    expect(l.nodes).toHaveLength(3);
    expect(l.shown).toBe(3);
    expect(l.total).toBeGreaterThan(3);
    expect(l.edges.every((e) => l.nodes.some((n) => n.id === e.from) && l.nodes.some((n) => n.id === e.to))).toBe(true);
  });
  it("survives exchange cycles", () => {
    const d = base();
    d.bindings.push(bind("fan", "ev", "", "exchange"));
    expect(buildLayout(d, opts).nodes.length).toBeGreaterThan(0);
  });
});

describe("pathsThrough", () => {
  it("collects upstream and downstream", () => {
    const l = buildLayout(base(), opts);
    const p = pathsThrough(l, "x:fan");
    expect([...p.nodes].sort()).toEqual(["p:api", "q:audit", "x:ev", "x:fan", "x:gone"]);
  });
});
