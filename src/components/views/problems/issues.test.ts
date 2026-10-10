import { describe, expect, it } from "vitest";
import {
  clusterProblems,
  isDeadLetterQueue,
  nodeProblems,
  queueProblem,
  queueStatus,
  sortClusterProblems,
  type ClusterProblem,
} from "./issues";

const q = (over: Record<string, unknown>) => ({ name: "orders.created", vhost: "orders", ...over });

describe("isDeadLetterQueue", () => {
  it("reads the name", () => {
    expect(isDeadLetterQueue("orders.dlq")).toBe(true);
    expect(isDeadLetterQueue("dead-letter")).toBe(true);
    expect(isDeadLetterQueue("payments.dead_letters.v2")).toBe(true);
    expect(isDeadLetterQueue("orders.created")).toBe(false);
    expect(isDeadLetterQueue("handled")).toBe(false);
  });
});

describe("queueProblem", () => {
  it("flags a backlog with consumers as critical", () => {
    const p = queueProblem(q({ messages_ready: 48210, consumers: 2 }));
    expect(p?.severity).toBe("crit");
    expect(p?.title).toBe("Queue backing up");
  });
  it("flags ready messages nobody consumes, by amount", () => {
    expect(queueProblem(q({ messages_ready: 50, consumers: 0 }))).toBeNull();
    expect(queueProblem(q({ messages_ready: 300, consumers: 0 }))?.severity).toBe("warn");
    expect(queueProblem(q({ messages_ready: 3120, consumers: 0 }))?.severity).toBe("crit");
  });
  it("shows the threshold behind the severity", () => {
    expect(queueProblem(q({ messages_ready: 596, consumers: 0 }))?.detail).toBe("596 waiting · above 100");
    expect(queueProblem(q({ messages_ready: 3120, consumers: 0 }))?.detail).toBe("3,120 waiting · above 1,000");
  });
  it("sends a dead-letter queue to its messages", () => {
    const p = queueProblem(q({ name: "payments.dlq", vhost: "payments", messages_ready: 4, consumers: 0 }));
    expect(p?.severity).toBe("warn");
    expect(p?.target).toEqual({ kind: "queue", vhost: "payments", name: "payments.dlq", view: "messages" });
    expect(queueProblem(q({ name: "payments.dlq", messages_ready: 0 }))).toBeNull();
  });
  it("leaves streams alone, but not a broken one", () => {
    expect(queueProblem(q({ type: "stream", messages_ready: 166_000_000, consumers: 0 }))).toBeNull();
    expect(queueProblem(q({ type: "quorum", state: "minority" }))?.title).toBe("Queue not running");
  });
  it("flags many unacknowledged", () => {
    expect(queueProblem(q({ messages_ready: 5, consumers: 1, messages_unacknowledged: 2500 }))?.title).toBe("Many unacknowledged");
  });
  it("tolerates missing numbers", () => {
    expect(queueProblem(q({}))).toBeNull();
  });
});

describe("queueStatus", () => {
  it("says running, idle and the problem", () => {
    expect(queueStatus(q({ state: "running", consumers: 1 }))).toEqual({ tone: "ok", label: "Running" });
    expect(queueStatus(q({ state: "idle", consumers: 1 })).tone).toBe("idle");
    expect(queueStatus(q({ messages_ready: 20000, consumers: 1 })).tone).toBe("crit");
  });
});

describe("nodeProblems", () => {
  it("reports a node that is down and nothing else about it", () => {
    const p = nodeProblems({ name: "rabbit@a", running: false, mem_alarm: true });
    expect(p.map((x) => x.title)).toEqual(["Node down"]);
  });
  it("tells an alarm from a warning", () => {
    expect(nodeProblems({ name: "a", running: true, mem_alarm: true, mem_used: 9, mem_limit: 10 })[0].severity).toBe("crit");
    expect(nodeProblems({ name: "a", running: true, mem_used: 9, mem_limit: 10 })[0].severity).toBe("warn");
    expect(nodeProblems({ name: "a", running: true, mem_used: 5, mem_limit: 10, disk_free: 100, disk_free_limit: 10 })).toEqual([]);
  });
  it("flags partitions and low disk", () => {
    const titles = nodeProblems({ name: "a", running: true, partitions: ["b"], disk_free: 15, disk_free_limit: 10 }).map((x) => x.title);
    expect(titles).toEqual(["Free disk close to the limit", "Network partition"]);
  });
  it("ignores a socket total of zero", () => {
    expect(nodeProblems({ name: "a", running: true, sockets_used: 0, sockets_total: 0 })).toEqual([]);
  });
});

describe("clusterProblems and ordering", () => {
  it("lists critical first", () => {
    const list = clusterProblems({
      queues: [q({ name: "a.dlq", messages_ready: 3 }), q({ name: "b", messages_ready: 5000, consumers: 0 })],
      nodes: [{ name: "n1", running: true, mem_alarm: true }],
    });
    expect(list.map((p) => p.severity)).toEqual(["crit", "crit", "warn"]);
  });
  it("puts production first within a severity", () => {
    const mk = (cluster: string, production: boolean): ClusterProblem => ({
      connectionId: cluster,
      cluster,
      color: "#000",
      production,
      problem: { id: "x", severity: "warn", title: "t", object: "o", detail: "", target: { kind: "overview" } },
    });
    expect(sortClusterProblems([mk("Local", false), mk("Prod", true)]).map((p) => p.cluster)).toEqual(["Prod", "Local"]);
  });
});
