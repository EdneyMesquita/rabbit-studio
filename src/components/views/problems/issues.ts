import type { Tone } from "@/components/data/parts";
import type { NodeInfo, Queue } from "@/types/rabbit";

/**
 * What needs attention, derived from data the views already poll: queues
 * with a backlog or no consumers, dead-letter queues holding messages,
 * node alarms and partitions. Pure, so every view says the same thing
 * about the same queue.
 */

export type Severity = "crit" | "warn";

/** Where a problem leads: the tab that explains it. */
export type ProblemTarget =
  | { kind: "queue"; vhost: string; name: string; view: "overview" | "messages" }
  | { kind: "nodes"; focus?: string }
  | { kind: "overview" };

export interface Problem {
  /** Stable across polls: kind + object. */
  id: string;
  severity: Severity;
  title: string;
  /** The queue or node it is about. */
  object: string;
  detail: string;
  target: ProblemTarget;
}

/** The fields of a queue the checks read: what a `columns=` list carries. */
export type ProblemQueue = Pick<Queue, "name" | "vhost"> &
  Partial<Pick<Queue, "type" | "state" | "messages" | "messages_ready" | "messages_unacknowledged" | "consumers">>;

export type ProblemNode = Pick<NodeInfo, "name"> & Partial<Omit<NodeInfo, "name">>;

/** Where "a lot" starts. Plain numbers so they are easy to tune. */
export const LIMITS = {
  /** Ready messages with consumers attached that still count as backing up. */
  backlog: 10_000,
  /** Ready messages nobody consumes: a warning from `noConsumersWarn`, critical from here. */
  noConsumersCrit: 1_000,
  noConsumersWarn: 100,
  unacked: 1_000,
  /** Fraction of a limit (memory, descriptors) that raises a warning. */
  nearLimit: 0.85,
  /** Free disk under this many times its limit raises a warning. */
  diskHeadroom: 2,
};

/** "orders.dlq", "dead-letter", "payments.dead_letters.v2": by name, as the API has no flag. */
const DLQ = /(^|[.\-_])(dlq|dead[-_.]?letters?)([.\-_]|$)/i;

export function isDeadLetterQueue(name: string): boolean {
  return DLQ.test(name);
}

const BROKEN_STATES = new Set(["down", "crashed", "stopped", "minority"]);

const n = (v: number | undefined | null) => v ?? 0;

/** The one thing wrong with a queue, or null. The most serious wins. */
export function queueProblem(q: ProblemQueue): Problem | null {
  const ready = n(q.messages_ready);
  const consumers = n(q.consumers);
  const target = (view: "overview" | "messages"): ProblemTarget => ({ kind: "queue", vhost: q.vhost, name: q.name, view });
  const base = { object: q.name, id: `queue:${q.vhost}:${q.name}` };
  const stream = q.type === "stream";

  if (q.state && BROKEN_STATES.has(q.state)) {
    return { ...base, severity: "crit", title: "Queue not running", detail: `State: ${q.state}`, target: target("overview") };
  }
  if (stream) return null;
  if (isDeadLetterQueue(q.name)) {
    return ready > 0
      ? { ...base, severity: "warn", title: "Dead letters waiting", detail: `${ready.toLocaleString("en-US")} messages in ${q.vhost}`, target: target("messages") }
      : null;
  }
  if (consumers > 0 && ready >= LIMITS.backlog) {
    return { ...base, severity: "crit", title: "Queue backing up", detail: `${ready.toLocaleString("en-US")} ready · above ${LIMITS.backlog.toLocaleString("en-US")}, ${consumers} consumers`, target: target("overview") };
  }
  if (consumers === 0 && ready >= LIMITS.noConsumersWarn) {
    // Say which threshold decided the severity, so the same title never changes color unexplained.
    const crit = ready >= LIMITS.noConsumersCrit;
    return {
      ...base,
      severity: crit ? "crit" : "warn",
      title: "No consumers",
      detail: `${ready.toLocaleString("en-US")} waiting · above ${(crit ? LIMITS.noConsumersCrit : LIMITS.noConsumersWarn).toLocaleString("en-US")}`,
      target: target("overview"),
    };
  }
  if (n(q.messages_unacknowledged) >= LIMITS.unacked) {
    return { ...base, severity: "warn", title: "Many unacknowledged", detail: `${n(q.messages_unacknowledged).toLocaleString("en-US")} unacked · above ${LIMITS.unacked.toLocaleString("en-US")}`, target: target("overview") };
  }
  return null;
}

/** A queue's state for its row: a tone and a word, matching `queueProblem`. */
export function queueStatus(q: ProblemQueue): { tone: Tone; label: string } {
  const p = queueProblem(q);
  if (p) return { tone: p.severity, label: p.title === "Dead letters waiting" ? "Dead letters" : p.title === "Many unacknowledged" ? "Unacked pile-up" : p.title };
  if (q.state === "idle") return { tone: "idle", label: "Idle" };
  if (q.state === "flow") return { tone: "warn", label: "Flow control" };
  if (q.state && q.state !== "running" && q.state !== "live") return { tone: "idle", label: q.state[0].toUpperCase() + q.state.slice(1) };
  return { tone: "ok", label: "Running" };
}

const frac = (used?: number, total?: number) => (total && total > 0 && used != null ? used / total : 0);

/** Every problem of one node. */
export function nodeProblems(node: ProblemNode): Problem[] {
  const out: Problem[] = [];
  const base = { object: node.name, target: { kind: "nodes", focus: node.name } as ProblemTarget };
  const add = (severity: Severity, key: string, title: string, detail: string) =>
    out.push({ ...base, id: `node:${node.name}:${key}`, severity, title, detail });

  if (node.running === false) {
    add("crit", "down", "Node down", "Not running");
    return out;
  }
  if (node.mem_alarm) add("crit", "mem", "Memory alarm", "Publishers are blocked on the whole cluster");
  else if (frac(node.mem_used, node.mem_limit) >= LIMITS.nearLimit) {
    add("warn", "mem", "Memory close to the alarm", `${Math.round(frac(node.mem_used, node.mem_limit) * 100)}% of the high watermark`);
  }
  if (node.disk_free_alarm) add("crit", "disk", "Low free disk", "Publishers are blocked on the whole cluster");
  else if (node.disk_free != null && node.disk_free_limit && node.disk_free < node.disk_free_limit * LIMITS.diskHeadroom) {
    add("warn", "disk", "Free disk close to the limit", "Less than twice the limit is left");
  }
  if (frac(node.fd_used, node.fd_total) >= 0.9) add("warn", "fd", "File descriptors running out", `${node.fd_used} of ${node.fd_total} in use`);
  if (frac(node.sockets_used, node.sockets_total) >= 0.9) add("warn", "sockets", "Sockets running out", `${node.sockets_used} of ${node.sockets_total} in use`);
  if (node.partitions?.length) add("crit", "partition", "Network partition", `Cannot see ${node.partitions.join(", ")}`);
  return out;
}

const rank = (p: Problem) => (p.severity === "crit" ? 0 : 1);

/** All problems of one cluster, critical first, then by object. */
export function clusterProblems(input: { queues?: ProblemQueue[]; nodes?: ProblemNode[] }): Problem[] {
  const out: Problem[] = [];
  for (const node of input.nodes ?? []) out.push(...nodeProblems(node));
  for (const q of input.queues ?? []) {
    const p = queueProblem(q);
    if (p) out.push(p);
  }
  return out.sort((a, b) => rank(a) - rank(b) || a.object.localeCompare(b.object));
}

export function unreachableProblem(error: string): Problem {
  return { id: "cluster:unreachable", severity: "crit", title: "Cluster unreachable", object: "management API", detail: error, target: { kind: "overview" } };
}

/** A problem placed on its cluster, for lists across clusters. */
export interface ClusterProblem {
  connectionId: string;
  cluster: string;
  color: string;
  production: boolean;
  problem: Problem;
}

/** Critical first, then production first, then by cluster name. */
export function sortClusterProblems(list: ClusterProblem[]): ClusterProblem[] {
  return [...list].sort(
    (a, b) =>
      rank(a.problem) - rank(b.problem) ||
      Number(b.production) - Number(a.production) ||
      a.cluster.localeCompare(b.cluster) ||
      a.problem.object.localeCompare(b.problem.object),
  );
}
