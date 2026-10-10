import { describe, expect, it } from "vitest";
import { parseFilter, type FilterRecord } from "./filter";

const rec = (over: Partial<FilterRecord> = {}): FilterRecord => ({
  routing_key: "order.created",
  exchange: "orders.events",
  redelivered: false,
  headers: {
    "x-first-death-reason": "rejected",
    "x.trace": "abc",
    "x-death": [{ count: 2, queue: "orders.created", reason: "rejected" }],
    tenant: "acme",
  },
  properties: { content_type: "application/json", priority: 3, message_id: "msg-1" },
  payload: { amount: { value: 150, currency: "EUR" }, sku: "SKU-1124", items: [{ qty: 2 }], at: "2026-10-10T16:48:02Z" },
  payloadText: '{"amount":{"value":150}}',
  ...over,
});

function run(src: string, r = rec()): boolean {
  const f = parseFilter(src);
  if (!f.ok) throw new Error(f.error);
  return f.test(r);
}

describe("parseFilter", () => {
  it("matches everything when empty", () => {
    expect(run("")).toBe(true);
    expect(run("   ")).toBe(true);
  });

  it("compares top-level fields", () => {
    expect(run("routing_key = 'order.created'")).toBe(true);
    expect(run("routing_key = order.created")).toBe(true);
    expect(run('exchange != "orders.events"')).toBe(false);
    expect(run("redelivered = false")).toBe(true);
    expect(run("redelivered = true")).toBe(false);
  });

  it("reads headers, including names with dots and dashes", () => {
    expect(run("headers.x-first-death-reason = 'rejected'")).toBe(true);
    expect(run("headers.x.trace = abc")).toBe(true);
    expect(run("headers.x-death.0.count >= 2")).toBe(true);
    expect(run("headers.missing = x")).toBe(false);
    expect(run("headers.missing = null")).toBe(true);
  });

  it("reads properties and payload paths numerically", () => {
    expect(run("properties.priority > 2")).toBe(true);
    expect(run("properties.priority < 3")).toBe(false);
    expect(run("payload.amount.value > 100")).toBe(true);
    expect(run("payload.amount.value <= 100")).toBe(false);
    expect(run("payload.amount.value = 150.0")).toBe(true);
    expect(run("payload.items.0.qty = 2")).toBe(true);
  });

  it("compares strings as text for ordering", () => {
    expect(run("payload.at > '2026-10-01'")).toBe(true);
    expect(run("payload.at < '2026-10-01'")).toBe(false);
  });

  it("supports contains and regex", () => {
    expect(run("payload.sku ~ 1124")).toBe(true);
    expect(run("payload ~ amount")).toBe(true);
    expect(run("payload.sku ~ /^sku-\\d+$/i")).toBe(true);
    expect(run("payload.sku ~ /^x/")).toBe(false);
    expect(run("headers.nope ~ a")).toBe(false);
  });

  it("joins clauses with and, ignoring and inside quotes", () => {
    expect(run("routing_key = order.created and payload.amount.value > 100")).toBe(true);
    expect(run("routing_key = order.created AND payload.amount.value > 1000")).toBe(false);
    expect(run("payload.sku = 'black and white'", rec({ payload: { sku: "black and white" } }))).toBe(true);
    const f = parseFilter("payload.sku = 'a and b' and exchange = x");
    expect(f.ok && f.clauses.length).toBe(2);
  });

  it("explains what it can't read", () => {
    const bad = parseFilter("amount > 100");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/Unknown path/);
    const noop = parseFilter("payload.amount");
    expect(noop.ok).toBe(false);
    if (!noop.ok) expect(noop.error).toBe('Can\'t read "payload.amount". Use path op value, e.g. payload.amount.value > 100');
    expect(parseFilter("payload.a ~ /(/").ok).toBe(false);
    expect(parseFilter("payload.a = 'open").ok).toBe(false);
    expect(parseFilter("headers = x").ok).toBe(false);
  });

  it("treats a missing payload path as no match for ordering", () => {
    expect(run("payload.amount.value > 1", rec({ payload: undefined }))).toBe(false);
  });

  it("reads stream offsets", () => {
    expect(run("offset >= 10", rec({ offset: 12 }))).toBe(true);
    expect(run("offset >= 10", rec({ offset: 2 }))).toBe(false);
  });
});
