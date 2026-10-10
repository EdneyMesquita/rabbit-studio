import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { RateDetails } from "@/types/rabbit";

/**
 * A line chart of a few series over the last minutes, drawn on a canvas
 * (one element however many points): 2px lines, a recessive grid, three y
 * ticks, a legend with the current values, and a crosshair tooltip on
 * hover. Colors are the validated series tokens s1..s3, in that fixed order.
 */

export interface Series {
  label: string;
  /** Token name: "s1" | "s2" | "s3". Fixed per meaning, never cycled. */
  color: "s1" | "s2" | "s3";
  points: { t: number; v: number }[];
}

/** The samples of a management API rate or length, oldest first. */
export function samplesOf(details: RateDetails | undefined, field: "sample" = "sample"): { t: number; v: number }[] {
  const s = details?.samples;
  if (!s?.length) return [];
  return s.map((p) => ({ t: p.timestamp, v: p[field] })).sort((a, b) => a.t - b.t);
}

/**
 * Rates from cumulative counters' samples: the management API's rate
 * samples are counter values, so a rate is the slope between neighbours.
 */
export function rateSamples(details: RateDetails | undefined): { t: number; v: number }[] {
  const pts = samplesOf(details);
  const out: { t: number; v: number }[] = [];
  for (let i = 1; i < pts.length; i++) {
    const dt = (pts[i].t - pts[i - 1].t) / 1000;
    if (dt > 0) out.push({ t: pts[i].t, v: Math.max(0, (pts[i].v - pts[i - 1].v) / dt) });
  }
  return out;
}

interface Props {
  series: Series[];
  height?: number;
  format: (v: number) => string;
  /** Accessible summary, e.g. "Message rates, last 10 minutes". */
  label: string;
  className?: string;
}

const PAD = { l: 44, r: 8, t: 8, b: 18 };

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

function clock(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function useThemeVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const mo = new MutationObserver(() => setV((x) => x + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return v;
}

export const TimeSeriesChart = memo(function TimeSeriesChart({ series, height = 120, format, label, className }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const theme = useThemeVersion();

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const domain = useMemo(() => {
    let t0 = Infinity;
    let t1 = -Infinity;
    let max = 0;
    for (const s of series)
      for (const p of s.points) {
        if (p.t < t0) t0 = p.t;
        if (p.t > t1) t1 = p.t;
        if (p.v > max) max = p.v;
      }
    if (!Number.isFinite(t0)) return null;
    if (t1 === t0) t1 = t0 + 1;
    return { t0, t1, max: niceMax(max) };
  }, [series]);

  // The time under the pointer, snapped to the first series' nearest sample.
  const hoverTimes = useMemo(() => {
    const longest = series.reduce((a, s) => (s.points.length > a.length ? s.points : a), [] as { t: number; v: number }[]);
    return longest.map((p) => p.t);
  }, [series]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    const grid = cssVar("--t-line-soft");
    const axis = cssVar("--t-fg-3");
    const plotW = width - PAD.l - PAD.r;
    const plotH = height - PAD.t - PAD.b;
    g.font = `400 10.5px ${cssVar("--font-mono") || "monospace"}`;
    g.textBaseline = "middle";
    const max = domain?.max ?? 1;
    for (let i = 0; i <= 2; i++) {
      const y = PAD.t + plotH - (plotH * i) / 2;
      g.strokeStyle = grid;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(PAD.l, Math.round(y) + 0.5);
      g.lineTo(width - PAD.r, Math.round(y) + 0.5);
      g.stroke();
      g.fillStyle = axis;
      g.textAlign = "right";
      g.fillText(format((max * i) / 2), PAD.l - 6, y);
    }
    if (!domain) return;
    const x = (t: number) => PAD.l + ((t - domain.t0) / (domain.t1 - domain.t0)) * plotW;
    const y = (v: number) => PAD.t + plotH - (v / domain.max) * plotH;
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.fillStyle = axis;
    g.fillText(clock(domain.t0), PAD.l, height - 4);
    g.textAlign = "right";
    g.fillText(clock(domain.t1), width - PAD.r, height - 4);
    series.forEach((s, si) => {
      if (s.points.length < 2) return;
      const color = cssVar(`--t-${s.color}`);
      if (si === 0) {
        g.globalAlpha = 0.1;
        g.fillStyle = color;
        g.beginPath();
        g.moveTo(x(s.points[0].t), y(0));
        for (const p of s.points) g.lineTo(x(p.t), y(p.v));
        g.lineTo(x(s.points[s.points.length - 1].t), y(0));
        g.closePath();
        g.fill();
        g.globalAlpha = 1;
      }
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.lineJoin = "round";
      g.lineCap = "round";
      g.beginPath();
      s.points.forEach((p, i) => (i ? g.lineTo(x(p.t), y(p.v)) : g.moveTo(x(p.t), y(p.v))));
      g.stroke();
    });
    if (hover != null) {
      const hx = x(hover);
      g.strokeStyle = cssVar("--t-field-line");
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(Math.round(hx) + 0.5, PAD.t);
      g.lineTo(Math.round(hx) + 0.5, PAD.t + plotH);
      g.stroke();
      for (const s of series) {
        const p = nearest(s.points, hover);
        if (!p) continue;
        g.fillStyle = cssVar(`--t-${s.color}`);
        g.strokeStyle = cssVar("--t-editor");
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x(p.t), y(p.v), 4, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    }
  }, [series, width, height, domain, hover, format, theme]);

  const current = series.map((s) => s.points[s.points.length - 1]?.v ?? null);
  const tipValues = hover != null ? series.map((s) => nearest(s.points, hover)?.v ?? null) : null;
  const tipLeft = hover != null && domain ? PAD.l + ((hover - domain.t0) / (domain.t1 - domain.t0)) * (width - PAD.l - PAD.r) : 0;

  return (
    <div className={cn("min-w-0", className)}>
      {series.length > 1 && (
        <div className="mb-1 flex flex-wrap gap-3.5 text-xs text-fg-2">
          {series.map((s, i) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-2.5 rounded-xs" style={{ background: `var(--t-${s.color})` }} aria-hidden />
              {s.label}
              <span className="font-mono text-[11.5px] font-medium text-fg tabular-nums">
                {current[i] == null ? "–" : format(current[i]!)}
              </span>
            </span>
          ))}
        </div>
      )}
      <div
        ref={wrap}
        className="relative"
        style={{ height }}
        role="img"
        aria-label={`${label}: ${series.map((s, i) => `${s.label} ${current[i] == null ? "no data" : format(current[i]!)}`).join(", ")}`}
        onPointerMove={(e) => {
          if (!domain || hoverTimes.length === 0) return;
          const r = e.currentTarget.getBoundingClientRect();
          const f = (e.clientX - r.left - PAD.l) / (width - PAD.l - PAD.r);
          const t = domain.t0 + Math.max(0, Math.min(1, f)) * (domain.t1 - domain.t0);
          setHover(nearestTime(hoverTimes, t));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <canvas ref={canvas} className="block" style={{ width: "100%", height }} />
        {hover != null && tipValues && (
          <div
            className="pointer-events-none absolute top-1 z-[5] min-w-[140px] rounded-md border border-line bg-popover px-2 py-1.5 text-xs shadow-overlay"
            style={tipLeft > width / 2 ? { right: width - tipLeft + 10 } : { left: tipLeft + 10 }}
          >
            <div className="mb-0.5 font-mono text-fg-3">{new Date(hover).toLocaleTimeString()}</div>
            {series.map((s, i) => (
              <div key={s.label} className="flex justify-between gap-2.5">
                <span className="inline-flex items-center gap-1.5 text-fg-2">
                  <span className="h-0.5 w-2.5 rounded-xs" style={{ background: `var(--t-${s.color})` }} aria-hidden />
                  {s.label}
                </span>
                <span className="font-mono tabular-nums">{tipValues[i] == null ? "–" : format(tipValues[i]!)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

function nearest(points: { t: number; v: number }[], t: number) {
  let best: { t: number; v: number } | null = null;
  let d = Infinity;
  for (const p of points) {
    const dd = Math.abs(p.t - t);
    if (dd < d) {
      d = dd;
      best = p;
    }
  }
  return best;
}

function nearestTime(times: number[], t: number): number {
  let best = times[0];
  for (const x of times) if (Math.abs(x - t) < Math.abs(best - t)) best = x;
  return best;
}
