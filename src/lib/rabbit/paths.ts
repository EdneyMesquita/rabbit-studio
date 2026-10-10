/**
 * Management API paths, percent-encoded. Every vhost and object name goes
 * through `enc`: the default vhost "/" must travel as %2F.
 */
export const enc = encodeURIComponent;

export type Query = Record<string, string | number | boolean | null | undefined>;

/** `path?k=v&...`, leaving out empty values. */
export function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${enc(String(v))}`);
  return parts.length ? `${path}${path.includes("?") ? "&" : "?"}${parts.join("&")}` : path;
}

/** Ask for `age` seconds of samples, one per `incr`, of lengths, rates and data rates. */
export function sampled(age = 600, incr = 10): Query {
  return {
    lengths_age: age,
    lengths_incr: incr,
    msg_rates_age: age,
    msg_rates_incr: incr,
    data_rates_age: age,
    data_rates_incr: incr,
  };
}

/** No samples at all: the cheapest lists. */
export const NO_SAMPLES: Query = { disable_stats: false };

const v = (vhost: string) => enc(vhost);
const scoped = (base: string, vhost?: string | null) => (vhost == null ? base : `${base}/${v(vhost)}`);

export const paths = {
  overview: "overview",
  whoami: "whoami",
  nodes: "nodes",
  node: (name: string) => `nodes/${enc(name)}`,
  extensions: "extensions",
  alarms: "health/checks/alarms",

  vhosts: "vhosts",
  vhost: (name: string) => `vhosts/${v(name)}`,
  vhostPermissions: (name: string) => `vhosts/${v(name)}/permissions`,
  vhostTopicPermissions: (name: string) => `vhosts/${v(name)}/topic-permissions`,

  queues: (vhost?: string | null) => scoped("queues", vhost),
  queue: (vhost: string, name: string) => `queues/${v(vhost)}/${enc(name)}`,
  queueBindings: (vhost: string, name: string) => `queues/${v(vhost)}/${enc(name)}/bindings`,
  /** DELETE purges. */
  queueContents: (vhost: string, name: string) => `queues/${v(vhost)}/${enc(name)}/contents`,
  /** POST {action: "sync" | "cancel_sync"} (classic mirrored, 3.x). */
  queueActions: (vhost: string, name: string) => `queues/${v(vhost)}/${enc(name)}/actions`,

  exchanges: (vhost?: string | null) => scoped("exchanges", vhost),
  exchange: (vhost: string, name: string) => `exchanges/${v(vhost)}/${enc(name || "amq.default")}`,
  exchangePublish: (vhost: string, name: string) => `exchanges/${v(vhost)}/${enc(name || "amq.default")}/publish`,
  exchangeBindingsSource: (vhost: string, name: string) => `exchanges/${v(vhost)}/${enc(name)}/bindings/source`,
  exchangeBindingsDestination: (vhost: string, name: string) =>
    `exchanges/${v(vhost)}/${enc(name)}/bindings/destination`,

  bindings: (vhost?: string | null) => scoped("bindings", vhost),
  /** POST {routing_key, arguments} creates; GET lists between the pair. */
  bindingPair: (vhost: string, source: string, destType: "queue" | "exchange", dest: string) =>
    `bindings/${v(vhost)}/e/${enc(source)}/${destType === "queue" ? "q" : "e"}/${enc(dest)}`,
  /** DELETE removes one binding, named by its properties_key. */
  binding: (vhost: string, source: string, destType: "queue" | "exchange", dest: string, propertiesKey: string) =>
    `bindings/${v(vhost)}/e/${enc(source)}/${destType === "queue" ? "q" : "e"}/${enc(dest)}/${enc(propertiesKey)}`,

  connections: "connections",
  connection: (name: string) => `connections/${enc(name)}`,
  connectionChannels: (name: string) => `connections/${enc(name)}/channels`,
  vhostConnections: (vhost: string) => `vhosts/${v(vhost)}/connections`,
  channels: "channels",
  channel: (name: string) => `channels/${enc(name)}`,
  consumers: (vhost?: string | null) => scoped("consumers", vhost),

  users: "users",
  user: (name: string) => `users/${enc(name)}`,
  userPermissions: (name: string) => `users/${enc(name)}/permissions`,
  userTopicPermissions: (name: string) => `users/${enc(name)}/topic-permissions`,
  usersBulkDelete: "users/bulk-delete",
  permissions: "permissions",
  permission: (vhost: string, user: string) => `permissions/${v(vhost)}/${enc(user)}`,
  topicPermissions: "topic-permissions",
  topicPermission: (vhost: string, user: string) => `topic-permissions/${v(vhost)}/${enc(user)}`,

  policies: (vhost?: string | null) => scoped("policies", vhost),
  policy: (vhost: string, name: string) => `policies/${v(vhost)}/${enc(name)}`,
  operatorPolicies: (vhost?: string | null) => scoped("operator-policies", vhost),
  operatorPolicy: (vhost: string, name: string) => `operator-policies/${v(vhost)}/${enc(name)}`,

  vhostLimits: "vhost-limits",
  vhostLimit: (vhost: string, name: "max-connections" | "max-queues") => `vhost-limits/${v(vhost)}/${name}`,
  userLimits: "user-limits",
  userLimit: (user: string, name: "max-connections" | "max-channels") => `user-limits/${enc(user)}/${name}`,

  featureFlags: "feature-flags",
  featureFlagEnable: (name: string) => `feature-flags/${enc(name)}/enable`,
  deprecatedFeatures: "deprecated-features",

  parameters: (component?: string, vhost?: string | null) =>
    component ? scoped(`parameters/${enc(component)}`, vhost) : "parameters",
  parameter: (component: string, vhost: string, name: string) => `parameters/${enc(component)}/${v(vhost)}/${enc(name)}`,
  globalParameters: "global-parameters",
  globalParameter: (name: string) => `global-parameters/${enc(name)}`,

  federationLinks: (vhost?: string | null) => scoped("federation-links", vhost),
  shovels: (vhost?: string | null) => scoped("shovels", vhost),
  shovelRestart: (vhost: string, name: string) => `shovels/vhost/${v(vhost)}/${enc(name)}/restart`,

  definitions: (vhost?: string | null) => scoped("definitions", vhost),
};
