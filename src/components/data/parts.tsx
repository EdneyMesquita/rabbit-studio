import type { ReactNode } from "react";
import { AlertTriangle, CircleAlert, Info, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The building blocks every data view shares (DESIGN.md: editor surfaces
 * are flat - tonal strips and hairlines, never cards). Keep views made of
 * these so they read as one app.
 */

/** The 40px bar at the top of a view: what it shows, then its actions. */
export function ViewToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 border-b border-line bg-editor px-3 text-base",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Pushes what follows to the right of a toolbar. */
export function Spacer() {
  return <div className="flex-1" />;
}

/** A view's title in its toolbar: an icon, the object's name, a quiet kind. */
export function ViewTitle({ icon: Icon, name, kind }: { icon?: LucideIcon; name: ReactNode; kind?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {Icon && <Icon className="size-4 shrink-0 text-fg-3" aria-hidden />}
      <span className="truncate font-mono text-[13px] font-medium text-fg">{name}</span>
      {kind && <span className="shrink-0 text-sm text-fg-3">{kind}</span>}
    </div>
  );
}

export type Tone = "ok" | "warn" | "crit" | "idle" | "info";

const toneText: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  crit: "text-danger",
  idle: "text-fg-3",
  info: "text-accent-text",
};

/** A state as a colored dot and a word: never color alone. */
export function StateLabel({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-sans text-sm text-fg">
      <span className={cn("inline-block size-1.5 rounded-full bg-current", toneText[tone])} aria-hidden />
      {children}
    </span>
  );
}

/** A tinted strip across the view: a warning about what it shows. */
export function Notice({
  tone,
  children,
  actions,
}: {
  tone: "warn" | "crit" | "info";
  children: ReactNode;
  actions?: ReactNode;
}) {
  const Icon = tone === "info" ? Info : tone === "warn" ? AlertTriangle : CircleAlert;
  return (
    <div
      role={tone === "crit" ? "alert" : "status"}
      className={cn(
        "flex min-h-9 shrink-0 flex-wrap items-center gap-2 border-b border-line py-1 pr-2 pl-3 text-sm text-fg-2 [&_b]:font-medium [&_b]:text-fg",
        tone === "warn" && "bg-[color-mix(in_srgb,var(--color-warn)_9%,var(--color-editor))]",
        tone === "crit" && "bg-[color-mix(in_srgb,var(--color-danger)_9%,var(--color-editor))]",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", toneText[tone === "crit" ? "crit" : tone])} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {actions}
    </div>
  );
}

export interface MetricItem {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
  onClick?: () => void;
  title?: string;
}

/** The strip of headline numbers under a toolbar. */
export function Metrics({ items }: { items: MetricItem[] }) {
  return (
    <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(128px,1fr))] border-b border-line">
      {items.map((m, i) => {
        const body = (
          <>
            <div className="flex items-center gap-1.5 text-xs whitespace-nowrap text-fg-2">
              {m.icon && <m.icon className={cn("size-3", m.tone ? toneText[m.tone] : "text-fg-3")} aria-hidden />}
              {m.label}
            </div>
            <div
              className={cn(
                "font-mono text-[13px] leading-5 font-medium tracking-[-0.01em] tabular-nums",
                m.tone && m.tone !== "idle" && m.tone !== "info" ? toneText[m.tone] : "text-fg",
              )}
            >
              {m.value}
            </div>
            {m.detail != null && <div className="truncate text-xs text-fg-3">{m.detail}</div>}
          </>
        );
        const cls = "min-w-0 border-r border-line-soft px-3 pt-[7px] pb-2 text-left last:border-r-0";
        return m.onClick ? (
          <button key={i} type="button" title={m.title} className={cn(cls, "hover:bg-row-hover")} onClick={m.onClick}>
            {body}
          </button>
        ) : (
          <div key={i} title={m.title} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** A section heading inside a view or an inspector. */
export function SectionHeader({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-t border-line-soft px-3 text-xs font-semibold tracking-[0.02em] text-fg-2 uppercase first:border-t-0">
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {actions}
    </div>
  );
}

/** Label/value rows: properties of the selected thing. */
export function KeyValues({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(96px,auto)_1fr] gap-x-3 gap-y-1 px-3 py-2 text-sm">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="truncate text-fg-3">{k}</dt>
          <dd className="min-w-0 truncate font-mono text-[12px] text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A thin meter: memory, disk, file descriptors. */
export function Meter({ value, max, tone }: { value: number; max: number; tone?: Tone }) {
  const f = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const t = tone ?? (f >= 0.9 ? "crit" : f >= 0.75 ? "warn" : "ok");
  return (
    <span className="mr-2 inline-block h-1 w-16 overflow-hidden rounded-xs bg-line align-middle" aria-hidden>
      <i
        className={cn("block h-full", t === "ok" ? "bg-ok" : t === "warn" ? "bg-warn" : t === "crit" ? "bg-danger" : "bg-fg-3")}
        style={{ width: `${f * 100}%` }}
      />
    </span>
  );
}

/** A small rounded tag (queue type, policy, feature): quiet. */
export function Tag({ children, title, className }: { children: ReactNode; title?: string; className?: string }) {
  return (
    <abbr
      title={title}
      className={cn(
        "inline-block rounded-xs bg-[color-mix(in_srgb,var(--color-fg)_7%,transparent)] px-1 py-0.5 font-mono text-[10px] leading-none font-medium text-fg-2 no-underline",
        title && "cursor-help",
        className,
      )}
    >
      {children}
    </abbr>
  );
}

/** What a view says when there is nothing to show, or it failed. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      {Icon && <Icon className="size-5 text-fg-3" aria-hidden />}
      <div className="text-base font-medium text-fg">{title}</div>
      {children && <div className="max-w-sm text-sm text-fg-3">{children}</div>}
      {action}
    </div>
  );
}

/** First load: a quiet spinner where the data will be. */
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 p-8 text-sm text-fg-3" role="status">
      <Loader2 className="size-3.5 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

/** A view's error, with what to do next. */
export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center" role="alert">
      <CircleAlert className="size-5 text-danger" aria-hidden />
      <div className="max-w-md text-sm text-fg-2">{error}</div>
      {onRetry && (
        <button type="button" className="text-sm text-accent-text hover:underline" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** A search box in a toolbar, filtering the rows below as you type. */
export function FilterField({
  value,
  onChange,
  placeholder = "Filter",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="search"
      value={value}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && value) {
          onChange("");
          e.stopPropagation();
        }
      }}
      className={cn(
        "h-7 w-56 rounded-sm border border-field-line bg-field px-2 font-mono text-[12px] text-fg outline-none placeholder:font-sans placeholder:text-fg-3 focus:border-accent",
        className,
      )}
    />
  );
}
