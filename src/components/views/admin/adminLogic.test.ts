import { describe, expect, it } from "vitest";
import {
  definitionCounts,
  definitionSummary,
  isNotFound,
  maskDeep,
  maskUri,
  policyMatches,
  policyValue,
  splitList,
  tagsOf,
  uriList,
} from "./adminLogic";

describe("tagsOf", () => {
  it("takes arrays and comma strings", () => {
    expect(tagsOf(["a", "b"])).toEqual(["a", "b"]);
    expect(tagsOf("a, b,,c")).toEqual(["a", "b", "c"]);
    expect(tagsOf(undefined)).toEqual([]);
  });
});

describe("uris", () => {
  it("masks the password only", () => {
    expect(maskUri("amqp://admin:s3cret@rabbit-b1:5672/orders")).toBe("amqp://admin:***@rabbit-b1:5672/orders");
    expect(maskUri("amqp://rabbit-b1:5672/orders")).toBe("amqp://rabbit-b1:5672/orders");
    expect(maskUri("amqp://")).toBe("amqp://");
  });
  it("lists one or many", () => {
    expect(uriList("amqp://a")).toEqual(["amqp://a"]);
    expect(uriList(["amqp://a", "amqp://b"])).toEqual(["amqp://a", "amqp://b"]);
    expect(uriList(undefined)).toEqual([]);
  });
  it("masks inside a definition", () => {
    expect(maskDeep({ "src-uri": "amqp://u:p@h", "src-queue": "q:x@y", n: 1 })).toEqual({
      "src-uri": "amqp://u:***@h",
      "src-queue": "q:x@y",
      n: 1,
    });
    expect(maskDeep({ uri: ["amqp://u:p@h"] })).toEqual({ uri: ["amqp://u:***@h"] });
  });
});

describe("isNotFound", () => {
  it("recognises the plugin-off answer", () => {
    expect(isNotFound("Not Found")).toBe(true);
    expect(isNotFound("connection refused")).toBe(false);
  });
});

describe("policyMatches", () => {
  const qs = [
    { name: "orders.created", type: "classic" },
    { name: "orders.audit", type: "stream" },
    { name: "orders.q", type: "quorum" },
    { name: "other", type: "classic" },
  ];
  const ex = [{ name: "" }, { name: "orders.events" }];
  it("honours apply-to", () => {
    expect(policyMatches("^orders\\.", "queues", qs, ex).queues).toHaveLength(3);
    expect(policyMatches("^orders\\.", "streams", qs, ex).queues).toEqual(["orders.audit"]);
    expect(policyMatches("^orders\\.", "classic_queues", qs, ex).queues).toEqual(["orders.created"]);
    expect(policyMatches("^orders\\.", "exchanges", qs, ex)).toMatchObject({ queues: [], exchanges: ["orders.events"] });
    const all = policyMatches(".*", "all", qs, ex);
    expect(all.queues).toHaveLength(4);
    expect(all.exchanges).toEqual(["orders.events"]);
  });
  it("flags a pattern that does not compile", () => {
    expect(policyMatches("(", "all", qs, ex).invalid).toBe(true);
  });
});

describe("definitionCounts", () => {
  it("counts only what the file has", () => {
    expect(definitionCounts({ queues: [1, 2], vhosts: [], other: 3 })).toEqual([
      { label: "Virtual hosts", count: 0 },
      { label: "Queues", count: 2 },
    ]);
    expect(definitionCounts([])).toEqual([]);
  });
});

describe("policy values", () => {
  it("types by key", () => {
    expect(policyValue("message-ttl", "3600")).toBe(3600);
    expect(policyValue("dead-letter-exchange", "123")).toBe("123");
    expect(policyValue("ha-params", "[\"a\"]")).toEqual(["a"]);
    expect(policyValue("custom", "true")).toBe(true);
    expect(policyValue("custom", "hello")).toBe("hello");
  });
  it("summarises", () => {
    expect(definitionSummary({ "max-length": 5, "dead-letter-exchange": "dlx" })).toBe("max-length=5, dead-letter-exchange=dlx");
  });
  it("splits lists", () => {
    expect(splitList("a, b\nc")).toEqual(["a", "b", "c"]);
  });
});
