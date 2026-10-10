/**
 * The RabbitMQ management API's shapes, as far as the app reads them.
 * Fields vary by version (3.13 vs 4.x) and by what the server has
 * collected so far, so almost everything is optional.
 */

/** A rate, with the samples the `*_age`/`*_incr` query params ask for. */
export interface RateDetails {
  rate: number;
  samples?: { sample: number; timestamp: number }[];
  avg?: number;
  avg_rate?: number;
}

export interface MessageStats {
  publish?: number;
  publish_details?: RateDetails;
  publish_in?: number;
  publish_in_details?: RateDetails;
  publish_out?: number;
  publish_out_details?: RateDetails;
  confirm?: number;
  confirm_details?: RateDetails;
  deliver?: number;
  deliver_details?: RateDetails;
  deliver_get?: number;
  deliver_get_details?: RateDetails;
  deliver_no_ack?: number;
  get?: number;
  get_no_ack?: number;
  ack?: number;
  ack_details?: RateDetails;
  redeliver?: number;
  redeliver_details?: RateDetails;
  return_unroutable?: number;
  return_unroutable_details?: RateDetails;
  drop_unroutable?: number;
  drop_unroutable_details?: RateDetails;
}

export interface QueueTotals {
  messages?: number;
  messages_details?: RateDetails;
  messages_ready?: number;
  messages_ready_details?: RateDetails;
  messages_unacknowledged?: number;
  messages_unacknowledged_details?: RateDetails;
}

export interface Overview {
  cluster_name: string;
  rabbitmq_version: string;
  management_version?: string;
  erlang_version?: string;
  node: string;
  rates_mode?: string;
  message_stats?: MessageStats;
  queue_totals?: QueueTotals;
  object_totals?: {
    connections: number;
    channels: number;
    exchanges: number;
    queues: number;
    consumers: number;
  };
  churn_rates?: Record<string, number>;
  listeners?: { node: string; protocol: string; ip_address: string; port: number }[];
  exchange_types?: { name: string; description: string; enabled: boolean }[];
}

export interface NodeInfo {
  name: string;
  type?: string;
  running: boolean;
  uptime?: number;
  mem_used?: number;
  mem_limit?: number;
  mem_alarm?: boolean;
  disk_free?: number;
  disk_free_limit?: number;
  disk_free_alarm?: boolean;
  fd_used?: number;
  fd_total?: number;
  sockets_used?: number;
  sockets_total?: number;
  proc_used?: number;
  proc_total?: number;
  run_queue?: number;
  processors?: number;
  partitions?: string[];
  os_pid?: string;
  enabled_plugins?: string[];
  being_drained?: boolean;
  mem_used_details?: RateDetails;
  io_read_avg_time?: number;
  rates_mode?: string;
  applications?: { name: string; description: string; version: string }[];
}

export type QueueType = "classic" | "quorum" | "stream";

export interface Queue extends QueueTotals {
  name: string;
  vhost: string;
  type?: QueueType;
  durable: boolean;
  auto_delete: boolean;
  exclusive?: boolean;
  arguments: Record<string, unknown>;
  node?: string;
  leader?: string;
  members?: string[];
  online?: string[];
  state?: string;
  consumers?: number;
  consumer_capacity?: number;
  consumer_utilisation?: number | null;
  policy?: string | null;
  operator_policy?: string | null;
  effective_policy_definition?: Record<string, unknown>;
  memory?: number;
  message_bytes?: number;
  message_bytes_ready?: number;
  message_bytes_unacknowledged?: number;
  idle_since?: string;
  head_message_timestamp?: number | null;
  message_stats?: MessageStats;
  consumer_details?: Consumer[];
  incoming?: unknown[];
  deliveries?: unknown[];
  /** Streams. */
  committed_offset?: number;
  first_offset?: number;
  segments?: number;
  delivery_limit?: number;
}

export interface Exchange {
  name: string;
  vhost: string;
  type: string;
  durable: boolean;
  auto_delete: boolean;
  internal: boolean;
  arguments: Record<string, unknown>;
  policy?: string | null;
  message_stats?: MessageStats;
}

export interface Binding {
  source: string;
  vhost: string;
  destination: string;
  destination_type: "queue" | "exchange";
  routing_key: string;
  arguments: Record<string, unknown>;
  properties_key: string;
}

export interface ClientProperties {
  product?: string;
  platform?: string;
  version?: string;
  connection_name?: string;
  information?: string;
  capabilities?: Record<string, boolean>;
}

export interface Connection {
  name: string;
  vhost: string;
  user: string;
  node: string;
  state?: string;
  protocol?: string;
  type?: string;
  host?: string;
  port?: number;
  peer_host?: string;
  peer_port?: number;
  ssl?: boolean;
  channels?: number;
  channel_max?: number;
  frame_max?: number;
  timeout?: number;
  connected_at?: number;
  client_properties?: ClientProperties;
  user_provided_name?: string;
  recv_oct?: number;
  send_oct?: number;
  recv_oct_details?: RateDetails;
  send_oct_details?: RateDetails;
  auth_mechanism?: string;
}

export interface Channel {
  name: string;
  number: number;
  vhost: string;
  user: string;
  node: string;
  state?: string;
  connection_details?: { name: string; peer_host?: string; peer_port?: number };
  consumer_count?: number;
  messages_unacknowledged?: number;
  messages_unconfirmed?: number;
  messages_uncommitted?: number;
  acks_uncommitted?: number;
  prefetch_count?: number;
  global_prefetch_count?: number;
  confirm?: boolean;
  transactional?: boolean;
  message_stats?: MessageStats;
}

export interface Consumer {
  consumer_tag: string;
  queue: { name: string; vhost: string };
  channel_details: {
    name: string;
    number?: number;
    connection_name?: string;
    peer_host?: string;
    peer_port?: number;
    user?: string;
  };
  ack_required: boolean;
  exclusive: boolean;
  prefetch_count: number;
  active?: boolean;
  activity_status?: string;
  arguments?: Record<string, unknown>;
}

export interface VHost {
  name: string;
  description?: string;
  tags?: string[];
  default_queue_type?: string;
  tracing?: boolean;
  messages?: number;
  messages_ready?: number;
  messages_unacknowledged?: number;
  message_stats?: MessageStats;
  recv_oct?: number;
  send_oct?: number;
  cluster_state?: Record<string, string>;
  metadata?: { description?: string; tags?: string[]; default_queue_type?: string };
}

export interface User {
  name: string;
  tags: string[] | string;
  password_hash?: string;
  hashing_algorithm?: string;
  limits?: Record<string, number>;
}

export interface Permission {
  user: string;
  vhost: string;
  configure: string;
  write: string;
  read: string;
}

export interface TopicPermission {
  user: string;
  vhost: string;
  exchange: string;
  write: string;
  read: string;
}

export type PolicyApplyTo = "queues" | "classic_queues" | "quorum_queues" | "streams" | "exchanges" | "all";

export interface Policy {
  vhost: string;
  name: string;
  pattern: string;
  "apply-to": PolicyApplyTo;
  definition: Record<string, unknown>;
  priority: number;
}

export interface VHostLimits {
  vhost: string;
  value: { "max-connections"?: number; "max-queues"?: number };
}

export interface UserLimits {
  user: string;
  value: { "max-connections"?: number; "max-channels"?: number };
}

export interface FeatureFlag {
  name: string;
  desc: string;
  doc_url?: string;
  stability: "stable" | "experimental" | "required" | string;
  provided_by: string;
  state: "enabled" | "disabled" | "unavailable" | string;
}

export interface Parameter {
  vhost: string;
  component: string;
  name: string;
  value: Record<string, unknown>;
}

export interface FederationLink {
  node: string;
  exchange?: string;
  queue?: string;
  upstream_exchange?: string;
  upstream_queue?: string;
  type: "exchange" | "queue";
  vhost: string;
  upstream: string;
  id?: string;
  status: string;
  local_connection?: string;
  uri?: string;
  timestamp?: string;
  error?: string;
}

export interface ShovelStatus {
  node: string;
  timestamp?: string;
  name: string;
  vhost: string;
  type: "dynamic" | "static";
  state: "starting" | "running" | "terminated" | string;
  src_uri?: string;
  src_protocol?: string;
  src_queue?: string;
  src_exchange?: string;
  dest_uri?: string;
  dest_protocol?: string;
  dest_queue?: string;
  dest_exchange?: string;
  reason?: string;
  blocked_status?: string;
}

/** The paginated wrapper `?page=` answers with. */
export interface Page<T> {
  items: T[];
  page: number;
  page_count: number;
  page_size: number;
  filtered_count: number;
  item_count: number;
  total_count: number;
}

/** A message read off a queue (management API `get` shape), with the
 * fingerprint a move or replay picks it by. */
export interface Message {
  payload_bytes: number;
  redelivered: boolean;
  exchange: string;
  routing_key: string;
  message_count?: number;
  properties: MessageProperties;
  payload: string;
  payload_encoding: "string" | "base64";
  fingerprint: string;
  /** Streams only. */
  offset?: number | null;
}

export interface MessageProperties {
  content_type?: string;
  content_encoding?: string;
  headers?: Record<string, unknown>;
  delivery_mode?: number;
  priority?: number;
  correlation_id?: string;
  reply_to?: string;
  expiration?: string;
  message_id?: string;
  timestamp?: number;
  type?: string;
  user_id?: string;
  app_id?: string;
}

export interface XDeath {
  count: number;
  exchange: string;
  queue: string;
  reason: "rejected" | "expired" | "maxlen" | "delivery_limit" | string;
  "routing-keys": string[];
  time: number;
  "original-expiration"?: string;
}

export type TransferTarget =
  | { kind: "queue"; queue: string }
  | { kind: "exchange"; exchange: string; routingKey: string }
  | { kind: "origin" }
  | { kind: "discard" };

export interface TransferInput {
  vhost: string;
  queue: string;
  target: TransferTarget;
  select?: string[] | null;
  limit?: number | null;
}

export interface TransferSummary {
  done: number;
  skipped: number;
  failed: number;
  missing: number;
  cancelled: boolean;
}

export interface TransferProgress {
  executionId: string;
  done: number;
  total: number;
}

export type StreamOffset =
  | { kind: "first" }
  | { kind: "last" }
  | { kind: "next" }
  | { kind: "offset"; value: number }
  | { kind: "timestamp"; value: number };
