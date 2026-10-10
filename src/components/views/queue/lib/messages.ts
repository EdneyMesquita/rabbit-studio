import { tryJson } from "@/components/data/JsonView";
import type { Message, MessageProperties, Queue, XDeath } from "@/types/rabbit";
import type { FilterRecord } from "./filter";

/** A message as the grid shows it: read once, parsed once. */
export interface Row {
  /** Unique in the list: the fingerprint can repeat for identical messages. */
  key: string;
  index: number;
  msg: Message;
  props: MessageProperties;
  headers: Record<string, unknown>;
  deaths: XDeath[];
  json: unknown;
  /** The payload as text (decoded from base64 when it is UTF-8). */
  text: string;
  /** base64 payload that isn't text: shown as hex. */
  binary: Uint8Array | null;
  record: FilterRecord;
}

/** Dead-letter queues by name: what most setups call them. */
export function isDlqName(name: string): boolean {
  return /(\.|-|_)(dlq|dead)$|dead[-_.]?letter/i.test(name);
}

/** The management API answers `[]` for no properties. */
export function propsOf(m: Message): MessageProperties {
  const p = m.properties as unknown;
  return p && typeof p === "object" && !Array.isArray(p) ? (p as MessageProperties) : {};
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

export function toRow(m: Message, index: number): Row {
  const props = propsOf(m);
  const headers = (props.headers && typeof props.headers === "object" ? props.headers : {}) as Record<string, unknown>;
  const deaths = Array.isArray(headers["x-death"]) ? (headers["x-death"] as XDeath[]) : [];
  let text = m.payload ?? "";
  let binary: Uint8Array | null = null;
  if (m.payload_encoding === "base64") {
    try {
      const bytes = decodeBase64(m.payload);
      try {
        text = utf8.decode(bytes);
      } catch {
        binary = bytes;
      }
    } catch {
      binary = new Uint8Array();
    }
  }
  const parsed = binary ? { ok: false as const } : tryJson(text);
  const json = parsed.ok ? parsed.value : undefined;
  return {
    key: `${m.fingerprint || "m"}#${index}`,
    index,
    msg: m,
    props,
    headers,
    deaths,
    json,
    text,
    binary,
    record: {
      routing_key: m.routing_key,
      exchange: m.exchange,
      redelivered: m.redelivered,
      headers,
      properties: props as Record<string, unknown>,
      payload: json,
      payloadText: binary ? "" : text,
      offset: m.offset,
    },
  };
}

/** A hex dump, 16 bytes a line, for payloads that aren't text. */
export function hexDump(bytes: Uint8Array, max = 4096): string {
  const lines: string[] = [];
  const n = Math.min(bytes.length, max);
  for (let i = 0; i < n; i += 16) {
    const chunk = bytes.subarray(i, Math.min(i + 16, n));
    const hex = Array.from(chunk, (b) => b.toString(16).padStart(2, "0")).join(" ");
    const ascii = Array.from(chunk, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
    lines.push(`${i.toString(16).padStart(6, "0")}  ${hex.padEnd(47)}  ${ascii}`);
  }
  if (bytes.length > max) lines.push(`… ${bytes.length - max} more bytes`);
  return lines.join("\n");
}

/** AMQP timestamps (and x-death times) are seconds since the epoch. */
export function secondsToMs(t: unknown): number | null {
  return typeof t === "number" && t > 0 ? t * 1000 : null;
}

/** The queue a dead-lettered message first died in. */
export function originOf(row: Row): { queue: string; exchange: string; routingKey: string } | null {
  const first = row.deaths[row.deaths.length - 1];
  if (!first) return null;
  return { queue: first.queue, exchange: first.exchange, routingKey: first["routing-keys"]?.[0] ?? "" };
}

/** A one-line, bounded preview of the payload for the grid. */
export function preview(row: Row): string {
  if (row.binary) return `<${row.binary.length} bytes binary>`;
  const t = row.json !== undefined ? JSON.stringify(row.json) : row.text;
  return t.length > 240 ? `${t.slice(0, 240)}…` : t;
}

/** The fingerprints of chosen rows, once each. */
export function fingerprints(rows: Row[]): string[] {
  return [...new Set(rows.map((r) => r.msg.fingerprint).filter(Boolean))];
}

/** What the queue's effective max length is, from its arguments or policy. */
export function maxLengthOf(q: Queue): number | null {
  const v = q.arguments?.["x-max-length"] ?? q.effective_policy_definition?.["max-length"];
  return typeof v === "number" ? v : null;
}

/** Messages as exported to a file: readable payloads, no internals. */
export function exportShape(rows: Row[]): unknown[] {
  return rows.map((r) => ({
    exchange: r.msg.exchange,
    routing_key: r.msg.routing_key,
    redelivered: r.msg.redelivered,
    properties: r.props,
    payload: r.json !== undefined ? r.json : r.binary ? r.msg.payload : r.text,
    payload_encoding: r.json !== undefined ? "json" : r.binary ? "base64" : "string",
    ...(r.msg.offset != null ? { offset: r.msg.offset } : {}),
  }));
}
