import { describe, expect, it } from "vitest";
import type { Binding } from "@/types/rabbit";
import { headersMatch, route, topicMatch } from "./routing";

const b = (source: string, destination: string, routing_key = "", args: Record<string, unknown> = {}, type: "queue" | "exchange" = "queue"): Binding => ({
  source,
  vhost: "/",
  destination,
  destination_type: type,
  routing_key,
  arguments: args,
  properties_key: routing_key,
});

describe("topicMatch", () => {
  it("* is exactly one word", () => {
    expect(topicMatch("order.*", "order.paid")).toBe(true);
    expect(topicMatch("order.*", "order")).toBe(false);
    expect(topicMatch("order.*", "order.paid.eu")).toBe(false);
    expect(topicMatch("*.paid.*", "order.paid.eu")).toBe(true);
  });
  it("# is zero or more words", () => {
    expect(topicMatch("#", "")).toBe(true);
    expect(topicMatch("#", "a.b.c")).toBe(true);
    expect(topicMatch("order.#", "order")).toBe(true);
    expect(topicMatch("order.#", "order.paid.eu")).toBe(true);
    expect(topicMatch("#.paid", "order.eu.paid")).toBe(true);
    expect(topicMatch("a.#.z", "a.z")).toBe(true);
    expect(topicMatch("a.#.z", "a.b.c.z")).toBe(true);
    expect(topicMatch("a.#.z", "a.b.c")).toBe(false);
  });
  it("literals must be equal", () => {
    expect(topicMatch("order.paid", "order.paid")).toBe(true);
    expect(topicMatch("order.paid", "order.shipped")).toBe(false);
  });
});

describe("headersMatch", () => {
  const h = { tenant: "shop", tier: 2, "x-trace": "1" };
  it("all is the default", () => {
    expect(headersMatch({ tenant: "shop" }, h)).toBe(true);
    expect(headersMatch({ tenant: "shop", tier: "3" }, h)).toBe(false);
    expect(headersMatch({}, h)).toBe(true);
  });
  it("any needs one hit, and none matches an empty binding", () => {
    expect(headersMatch({ "x-match": "any", tenant: "x", tier: 2 }, h)).toBe(true);
    expect(headersMatch({ "x-match": "any", tenant: "x" }, h)).toBe(false);
    expect(headersMatch({ "x-match": "any" }, h)).toBe(false);
  });
  it("x- keys count only with -with-x", () => {
    expect(headersMatch({ "x-match": "all", "x-trace": "nope" }, h)).toBe(true);
    expect(headersMatch({ "x-match": "all-with-x", "x-trace": "nope" }, h)).toBe(false);
    expect(headersMatch({ "x-match": "all-with-x", "x-trace": "1" }, h)).toBe(true);
    expect(headersMatch({ "x-match": "any-with-x", "x-trace": "1", tenant: "no" }, h)).toBe(true);
  });
});

describe("route", () => {
  const exchanges = [
    { name: "ev", type: "topic" },
    { name: "fan", type: "fanout" },
    { name: "dir", type: "direct" },
    { name: "hd", type: "headers" },
    { name: "loopA", type: "fanout" },
    { name: "loopB", type: "fanout" },
  ];
  const bindings = [
    b("ev", "paid", "order.paid"),
    b("ev", "all", "order.#"),
    b("ev", "fan", "order.#", {}, "exchange"),
    b("fan", "all"),
    b("fan", "audit"),
    b("dir", "q1", "k"),
    b("hd", "hq", "", { tenant: "shop", "x-match": "all" }),
    b("loopA", "loopB", "", {}, "exchange"),
    b("loopB", "loopA", "", {}, "exchange"),
    b("loopB", "lq"),
    b("", "dq", "dq"),
  ];
  it("follows exchange-to-exchange bindings with the path, once per queue", () => {
    const r = route("ev", "order.paid", {}, bindings, exchanges);
    expect(r.map((x) => x.queue)).toEqual(["paid", "all", "audit"]);
    expect(r[1].via).toHaveLength(1);
    expect(r[2].via.map((v) => v.destination)).toEqual(["fan", "audit"]);
  });
  it("direct and headers", () => {
    expect(route("dir", "k", {}, bindings, exchanges).map((x) => x.queue)).toEqual(["q1"]);
    expect(route("dir", "z", {}, bindings, exchanges)).toEqual([]);
    expect(route("hd", "", { tenant: "shop" }, bindings, exchanges).map((x) => x.queue)).toEqual(["hq"]);
    expect(route("hd", "", { tenant: "x" }, bindings, exchanges)).toEqual([]);
  });
  it("the default exchange routes by queue name", () => {
    expect(route("", "dq", {}, bindings, exchanges).map((x) => x.queue)).toEqual(["dq"]);
    expect(route("", "nope", {}, bindings, exchanges)).toEqual([]);
  });
  it("survives binding cycles and unknown exchanges", () => {
    expect(route("loopA", "", {}, bindings, exchanges).map((x) => x.queue)).toEqual(["lq"]);
    expect(route("ghost", "", {}, bindings, exchanges)).toEqual([]);
  });
});
