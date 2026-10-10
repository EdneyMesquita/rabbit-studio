/** Pure helpers of the admin area: what the broker's shapes need before they reach a screen. */

/** Tags as a list: the API answers with an array (4.x) or a comma string (older). */
export function tagsOf(tags: string[] | string | null | undefined): string[] {
  if (Array.isArray(tags)) return tags.filter(Boolean);
  return (tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** "a, b ,,c" -> ["a","b","c"]. */
export function splitList(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export const USER_TAGS = ["administrator", "monitoring", "policymaker", "management", "impersonator"];

/** A URI with its password hidden: amqp://user:***@host/vhost. */
export function maskUri(uri: string): string {
  return uri.replace(/^([a-z][a-z0-9+.-]*:\/\/)([^:@/?#]*):([^@/?#]*)@/i, "$1$2:***@");
}

/** A `uri` parameter is one string or a list. */
export function uriList(uri: unknown): string[] {
  if (typeof uri === "string") return uri ? [uri] : [];
  if (Array.isArray(uri)) return uri.filter((u): u is string => typeof u === "string");
  return [];
}

/** A value with every URI string in it masked (for showing a definition). */
export function maskDeep(value: unknown, key = ""): unknown {
  if (typeof value === "string") return /uri$/i.test(key) ? maskUri(value) : value;
  if (Array.isArray(value)) return value.map((v) => maskDeep(v, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskDeep(v, k)]));
  }
  return value;
}

/** The server's "not there" answer: how a plugin that is off looks (the status is not in the message). */
export function isNotFound(message: string): boolean {
  return /not\s*found|404/i.test(message);
}

export interface Named {
  name: string;
  type?: string;
}

/**
 * What a policy applies to, tested in the browser the way the broker does
 * (an unanchored match of the pattern on the name, within the apply-to scope).
 */
export function policyMatches(
  pattern: string,
  applyTo: string,
  queues: Named[],
  exchanges: Named[],
): { queues: string[]; exchanges: string[]; invalid: boolean } {
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch {
    return { queues: [], exchanges: [], invalid: true };
  }
  const queueScope: Record<string, (q: Named) => boolean> = {
    all: () => true,
    queues: () => true,
    classic_queues: (q) => q.type === "classic",
    quorum_queues: (q) => q.type === "quorum",
    streams: (q) => q.type === "stream",
  };
  const inQueues = queueScope[applyTo];
  return {
    queues: inQueues ? queues.filter((q) => inQueues(q) && re.test(q.name)).map((q) => q.name) : [],
    exchanges:
      applyTo === "all" || applyTo === "exchanges"
        ? exchanges.filter((e) => e.name && re.test(e.name)).map((e) => e.name)
        : [],
    invalid: false,
  };
}

/** How many of each thing a definitions file holds; only the keys it has. */
export function definitionCounts(json: unknown): { label: string; count: number }[] {
  if (!json || typeof json !== "object" || Array.isArray(json)) return [];
  const o = json as Record<string, unknown>;
  const keys: [string, string][] = [
    ["users", "Users"],
    ["vhosts", "Virtual hosts"],
    ["permissions", "Permissions"],
    ["topic_permissions", "Topic permissions"],
    ["queues", "Queues"],
    ["exchanges", "Exchanges"],
    ["bindings", "Bindings"],
    ["policies", "Policies"],
    ["operator_policies", "Operator policies"],
    ["parameters", "Parameters"],
    ["global_parameters", "Global parameters"],
  ];
  return keys.flatMap(([k, label]) => (Array.isArray(o[k]) ? [{ label, count: (o[k] as unknown[]).length }] : []));
}

export type PolicyValueType = "number" | "string" | "enum" | "json";

export interface PolicyKey {
  key: string;
  type: PolicyValueType;
  options?: string[];
  hint?: string;
  /** Operator policies accept it too. */
  operator?: boolean;
}

/** The definition keys the broker recognises, with the shape of their values. */
export const POLICY_KEYS: PolicyKey[] = [
  { key: "message-ttl", type: "number", hint: "ms", operator: true },
  { key: "expires", type: "number", hint: "ms idle before the queue is deleted", operator: true },
  { key: "max-length", type: "number", hint: "messages", operator: true },
  { key: "max-length-bytes", type: "number", hint: "bytes", operator: true },
  { key: "max-in-memory-length", type: "number", operator: true },
  { key: "max-in-memory-bytes", type: "number", operator: true },
  { key: "overflow", type: "enum", options: ["drop-head", "reject-publish", "reject-publish-dlx"], operator: true },
  { key: "delivery-limit", type: "number", hint: "quorum queues", operator: true },
  { key: "target-group-size", type: "number", hint: "quorum queues", operator: true },
  { key: "dead-letter-exchange", type: "string" },
  { key: "dead-letter-routing-key", type: "string" },
  { key: "dead-letter-strategy", type: "enum", options: ["at-most-once", "at-least-once"] },
  { key: "queue-mode", type: "enum", options: ["default", "lazy"] },
  { key: "queue-version", type: "number", hint: "classic queues: 1 or 2" },
  { key: "queue-leader-locator", type: "enum", options: ["client-local", "balanced"] },
  { key: "initial-cluster-size", type: "number" },
  { key: "ha-mode", type: "enum", options: ["all", "exactly", "nodes"] },
  { key: "ha-params", type: "json", hint: "number or list of nodes" },
  { key: "ha-sync-mode", type: "enum", options: ["automatic", "manual"] },
  { key: "ha-promote-on-shutdown", type: "enum", options: ["when-synced", "always"] },
  { key: "ha-promote-on-failure", type: "enum", options: ["when-synced", "always"] },
  { key: "federation-upstream", type: "string" },
  { key: "federation-upstream-set", type: "string", hint: "name or all" },
  { key: "alternate-exchange", type: "string" },
  { key: "max-age", type: "string", hint: "streams: 7D, 12h, 30m", operator: false },
  { key: "stream-max-segment-size-bytes", type: "number" },
  { key: "stream-filter-size-bytes", type: "number" },
];

const POLICY_KEY_BY_NAME = new Map(POLICY_KEYS.map((k) => [k.key, k]));

export function policyKey(key: string): PolicyKey | undefined {
  return POLICY_KEY_BY_NAME.get(key);
}

/** A text typed for a key, as the value it stands for (numbers stay numbers). */
export function policyValue(key: string, text: string): unknown {
  const spec = policyKey(key);
  const t = text.trim();
  if (spec?.type === "string" || spec?.type === "enum") return text;
  if (spec?.type === "number") return t === "" || Number.isNaN(Number(t)) ? text : Number(t);
  // json or unknown key: numbers, booleans, lists and objects as typed, otherwise text.
  try {
    return JSON.parse(t);
  } catch {
    return text;
  }
}

/** A value as the text of its input. */
export function policyText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** "message-ttl=3600000, dead-letter-exchange=dlx": a definition on one line. */
export function definitionSummary(def: Record<string, unknown> | undefined): string {
  return Object.entries(def ?? {})
    .map(([k, v]) => `${k}=${policyText(v)}`)
    .join(", ");
}
