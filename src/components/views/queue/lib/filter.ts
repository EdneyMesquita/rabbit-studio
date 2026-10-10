/**
 * The messages view's `where` language: `path op value`, clauses joined by
 * `and`. It runs on messages already read (a peek), so it narrows what is
 * shown, never what the broker hands out.
 *
 *   routing_key = 'order.created' and payload.amount.value > 100
 *   headers.x-first-death-reason = rejected
 *   payload.customer ~ /^cust-3\d+$/i
 *
 * Paths: routing_key, exchange, redelivered, offset, headers.*,
 * properties.*, payload (the raw text) and payload.* (into the parsed JSON).
 * Operators: = != > < >= <= and ~ (contains, or a /regex/flags).
 */

/** A message as the filter reads it: payload parsed once, up front. */
export interface FilterRecord {
  routing_key: string;
  exchange: string;
  redelivered: boolean;
  headers: Record<string, unknown>;
  properties: Record<string, unknown>;
  /** The parsed JSON payload; undefined when it isn't JSON. */
  payload: unknown;
  payloadText: string;
  offset?: number | null;
}

export type Op = "=" | "!=" | ">" | "<" | ">=" | "<=" | "~";

export interface Clause {
  path: string[];
  op: Op;
  value: string | number | boolean | null | RegExp;
}

export type ParsedFilter =
  | { ok: true; clauses: Clause[]; test: (r: FilterRecord) => boolean }
  | { ok: false; error: string };

const ROOTS = new Set(["routing_key", "exchange", "redelivered", "offset", "headers", "properties", "payload"]);
const EXAMPLE = "e.g. payload.amount.value > 100";

/** Splits on ` and ` outside quotes and regex literals. */
function splitClauses(src: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      cur += ch;
      if (ch === "\\" && i + 1 < src.length) cur += src[++i];
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      continue;
    }
    // A regex starts right after the ~ operator (spaces allowed).
    if (ch === "/" && /~\s*$/.test(cur)) {
      quote = "/";
      cur += ch;
      continue;
    }
    const m = /^\s+and\s+/i.exec(src.slice(i));
    if (m) {
      out.push(cur);
      cur = "";
      i += m[0].length - 1;
      continue;
    }
    cur += ch;
  }
  if (quote && quote !== "/") throw new Error(`Unclosed quote in "${src.trim()}".`);
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseValue(raw: string, op: Op): Clause["value"] {
  const q = /^(['"])(.*)\1$/s.exec(raw);
  if (q) return q[2].replace(/\\(.)/g, "$1");
  if (op === "~") {
    const re = /^\/(.*)\/([a-z]*)$/s.exec(raw);
    if (re) {
      try {
        return new RegExp(re[1], re[2]);
      } catch (e) {
        throw new Error(`Bad regular expression ${raw}: ${(e as Error).message}`);
      }
    }
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (raw !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

/** Parses the filter; an empty one matches everything. */
export function parseFilter(src: string): ParsedFilter {
  const text = (src ?? "").trim();
  if (!text) return { ok: true, clauses: [], test: () => true };
  let parts: string[];
  try {
    parts = splitClauses(text);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const clauses: Clause[] = [];
  for (const p of parts) {
    const m = /^([\w.\-]+)\s*(!=|>=|<=|=|>|<|~)\s*(.+)$/s.exec(p);
    if (!m) return { ok: false, error: `Can't read "${p}". Use path op value, ${EXAMPLE}` };
    const [, pathText, op, raw] = m;
    const path = pathText.split(".");
    if (!ROOTS.has(path[0]) || path.some((s) => s === "")) {
      return {
        ok: false,
        error: `Unknown path "${pathText}". Start with routing_key, exchange, redelivered, headers., properties. or payload., ${EXAMPLE}`,
      };
    }
    if ((path[0] === "headers" || path[0] === "properties") && path.length < 2) {
      return { ok: false, error: `"${pathText}" needs a name, e.g. ${path[0]}.${path[0] === "headers" ? "x-first-death-reason" : "content_type"}` };
    }
    try {
      clauses.push({ path, op: op as Op, value: parseValue(raw.trim(), op as Op) });
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  return { ok: true, clauses, test: (r) => clauses.every((c) => matches(c, r)) };
}

/**
 * Walks `segs` into `o`. Keys may hold dots themselves (header names like
 * `x.trace`), so the longest key that exists wins at each level.
 */
export function walk(o: unknown, segs: string[]): unknown {
  if (segs.length === 0) return o;
  if (o == null || typeof o !== "object") return undefined;
  const rec = o as Record<string, unknown>;
  for (let k = segs.length; k >= 1; k--) {
    const key = segs.slice(0, k).join(".");
    if (Object.prototype.hasOwnProperty.call(rec, key)) {
      const v = walk(rec[key], segs.slice(k));
      if (v !== undefined || k === 1) return v;
    }
  }
  return undefined;
}

/** The value at a path of a message. */
export function valueAt(r: FilterRecord, path: string[]): unknown {
  const [root, ...rest] = path;
  switch (root) {
    case "routing_key":
      return rest.length ? undefined : r.routing_key;
    case "exchange":
      return rest.length ? undefined : r.exchange;
    case "redelivered":
      return rest.length ? undefined : r.redelivered;
    case "offset":
      return rest.length ? undefined : r.offset;
    case "headers":
      return walk(r.headers, rest);
    case "properties":
      return walk(r.properties, rest);
    case "payload":
      return rest.length ? walk(r.payload, rest) : r.payloadText;
    default:
      return undefined;
  }
}

const numeric = (v: unknown): number | null => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
};

function text(v: unknown): string {
  if (v == null) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

function equals(v: unknown, want: Clause["value"]): boolean {
  if (want === null) return v == null;
  if (v === undefined) return false;
  const a = numeric(v);
  const b = numeric(want);
  if (a != null && b != null) return a === b;
  return text(v) === text(want);
}

function matches(c: Clause, r: FilterRecord): boolean {
  const v = valueAt(r, c.path);
  switch (c.op) {
    case "=":
      return equals(v, c.value);
    case "!=":
      return !equals(v, c.value);
    case "~":
      if (v === undefined) return false;
      return c.value instanceof RegExp ? c.value.test(text(v)) : text(v).includes(text(c.value));
    default: {
      if (v == null) return false;
      const a = numeric(v);
      const b = numeric(c.value);
      let d: number;
      if (a != null && b != null) d = a - b;
      // Strings compare as text: ISO times and versions order this way.
      else if (typeof c.value === "string") d = text(v) < c.value ? -1 : text(v) > c.value ? 1 : 0;
      else return false;
      return c.op === ">" ? d > 0 : c.op === "<" ? d < 0 : c.op === ">=" ? d >= 0 : d <= 0;
    }
  }
}
