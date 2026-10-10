import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/data/parts";
import { cn } from "@/lib/utils";
import { invalidate, useLive } from "@/hooks/useLive";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { paths, withQuery } from "@/lib/rabbit/paths";
import { isReadOnly } from "@/lib/rabbit/guard";
import type { ViewProps } from "../types";
import { USER_TAGS } from "./adminLogic";

/** What every section receives: the connection and whether it is on screen. */
export interface SectionProps {
  cid: string;
  tab: ViewProps["tab"];
  shown: boolean;
}

export const READ_ONLY_REASON = "This connection is read-only";

/** Disabled-with-a-reason props for a mutating control. */
export function mutating(cid: string): { disabled?: boolean; title?: string } {
  return isReadOnly(cid) ? { disabled: true, title: READ_ONLY_REASON } : {};
}

/**
 * Runs a change, then refreshes what the connection shows and says so.
 * Resolves true when it went through; the broker's reason is toasted otherwise.
 */
export async function mutate(cid: string, change: () => Promise<unknown>, done: string, detail?: string): Promise<boolean> {
  try {
    await change();
  } catch (e) {
    toast.error("The change failed", { description: errorText(e) });
    return false;
  }
  invalidate(`${cid}:`);
  toast.success(done, detail ? { description: detail } : undefined);
  return true;
}

/** Names of the vhosts, fetched once (dialogs and pickers). */
export function useVhostNames(cid: string, shown = true): string[] {
  const live = useLive<{ name: string }[]>(
    `${cid}:admin:vhost-names`,
    () => rabbit(cid).get(withQuery(paths.vhosts, { columns: "name" })),
    { interval: 0, enabled: shown },
  );
  return (live.data ?? []).map((v) => v.name).sort((a, b) => a.localeCompare(b));
}

/** A label over a control, with a hint under it. */
export function Field({
  label,
  htmlFor,
  help,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  help?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {help && <span className="text-xs text-fg-3">{help}</span>}
    </div>
  );
}

/** Fields side by side. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

/** The view's frame: toolbar, then the table and the inspector side by side. */
export function SectionFrame({
  toolbar,
  notice,
  children,
  inspector,
}: {
  toolbar: ReactNode;
  notice?: ReactNode;
  children: ReactNode;
  inspector?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-editor">
      {toolbar}
      {notice}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        {inspector}
      </div>
    </div>
  );
}

/** Toggleable chips: the tags of a user or a vhost. */
export function TagChips({
  value,
  onChange,
  suggestions = USER_TAGS,
  disabled,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  disabled?: boolean;
}) {
  const [custom, setCustom] = useState("");
  const all = [...suggestions, ...value.filter((t) => !suggestions.includes(t))];
  const toggle = (t: string) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  const add = () => {
    const t = custom.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setCustom("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      {all.map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={value.includes(t)}
          disabled={disabled}
          onClick={() => toggle(t)}
          className="rounded-xs bg-fg/7 px-1.5 py-1 font-mono text-[11px] leading-none text-fg-2 hover:text-fg disabled:opacity-50 aria-pressed:bg-accent/15 aria-pressed:text-accent-text"
        >
          {t}
        </button>
      ))}
      <Input
        value={custom}
        disabled={disabled}
        placeholder="custom tag"
        aria-label="Custom tag"
        className="h-6 w-28 px-1.5 font-mono text-[11px]"
        onChange={(e) => setCustom(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

/** One numeric limit: its value, Set and Clear. */
export function LimitEditor({
  label,
  value,
  readOnly,
  onSet,
  onClear,
}: {
  label: string;
  value: number | undefined;
  readOnly?: boolean;
  onSet: (value: number) => void;
  onClear: () => void;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const [seen, setSeen] = useState(value);
  // Follow the broker when it changes the value (another editor, a refresh).
  if (seen !== value) {
    setSeen(value);
    setText(value == null ? "" : String(value));
  }
  const n = Number(text);
  const valid = text.trim() !== "" && Number.isInteger(n) && n >= -1;
  return (
    <div className="flex items-center gap-2 px-3 py-1 text-sm">
      <span className="w-32 shrink-0 truncate font-mono text-[12px] text-fg-2">{label}</span>
      <Input
        value={text}
        inputMode="numeric"
        placeholder="no limit"
        aria-label={label}
        disabled={readOnly}
        className="h-6 min-w-0 flex-1 px-1.5 font-mono text-[12px]"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && valid && n !== value) onSet(n);
        }}
      />
      <Button size="sm" disabled={readOnly || !valid || n === value} title={readOnly ? READ_ONLY_REASON : undefined} onClick={() => onSet(n)}>
        Set
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={readOnly || value == null}
        title={readOnly ? READ_ONLY_REASON : undefined}
        onClick={onClear}
      >
        Clear
      </Button>
    </div>
  );
}

/** What federation and shovels say when their plugin is not enabled. */
export function PluginOff({ plugin, extra }: { plugin: string; extra: string }) {
  return (
    <EmptyState title={`The ${plugin} plugin is not enabled`}>
      <p>Enable it on every node, then reopen this view:</p>
      <pre className="mt-2 rounded-sm bg-panel px-2 py-1.5 text-left font-mono text-[12px] text-fg">
        rabbitmq-plugins enable {extra}
      </pre>
    </EmptyState>
  );
}

/** "ok" while it runs, "warn" while it starts, "crit" otherwise. */
export function stateTone(state: string): "ok" | "warn" | "crit" | "idle" {
  if (state === "running") return "ok";
  if (state === "starting") return "warn";
  if (state === "terminated" || state === "stopped") return "idle";
  return "crit";
}
