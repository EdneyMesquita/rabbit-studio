/** Number and time formatting for the data views: compact, tabular. */

const nf = new Intl.NumberFormat("en-US");

/** 1234567 -> "1,234,567"; null/undefined -> "–". */
export function int(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? "–" : nf.format(Math.round(n));
}

/** 1234567 -> "1.2M", 15300 -> "15.3k". */
export function compact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e9) return `${trim(n / 1e9)}B`;
  if (a >= 1e6) return `${trim(n / 1e6)}M`;
  if (a >= 1e4) return `${trim(n / 1e3)}k`;
  return int(n);
}

function trim(n: number): string {
  return (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1)).replace(/\.0$/, "");
}

/** A rate in messages per second: "0", "0.4/s", "12/s", "1.2k/s". */
export function rate(r: number | null | undefined): string {
  if (r == null || Number.isNaN(r)) return "–";
  if (r === 0) return "0/s";
  if (Math.abs(r) < 10) return `${r.toFixed(1).replace(/\.0$/, "")}/s`;
  return `${compact(r)}/s`;
}

/** Bytes: "512 B", "1.4 KiB", "3.2 GiB". */
export function bytes(b: number | null | undefined): string {
  if (b == null || Number.isNaN(b)) return "–";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let v = b;
  let i = 0;
  while (Math.abs(v) >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? v.toFixed(0) : v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

/** A duration in ms: "850 ms", "42 s", "3 min", "5 h 12 min", "4 d 2 h". */
export function duration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "–";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

/** How long ago a time (ms since epoch) was: "just now", "4 min ago". */
export function ago(at: number | null | undefined, now = Date.now()): string {
  if (!at) return "–";
  const d = now - at;
  if (d < 5000) return "just now";
  return `${duration(d)} ago`;
}

/** Local date and time, to the second: "2026-10-10 14:03:22". */
export function dateTime(ms: number | null | undefined): string {
  if (!ms) return "–";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 0.4567 -> "46%". */
export function percent(f: number | null | undefined, digits = 0): string {
  if (f == null || Number.isNaN(f)) return "–";
  return `${(f * 100).toFixed(digits)}%`;
}

/** The vhost as people say it: "/" stays "/". */
export function vhostLabel(vhost: string): string {
  return vhost;
}

/** "rabbit@ip-10-0-1-7" -> "ip-10-0-1-7". */
export function shortNode(node: string | null | undefined): string {
  if (!node) return "–";
  const at = node.indexOf("@");
  return at >= 0 ? node.slice(at + 1) : node;
}
