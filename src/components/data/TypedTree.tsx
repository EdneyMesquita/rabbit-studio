import { memo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The inherited typed key/value tree (DESIGN.md, "Message inspector"):
 * one row per key - key in Key Orchid, the value colored by its type, a
 * faint type tag at the right - and objects or arrays folding open in
 * place. How properties, headers, arguments and payloads read in an
 * inspector; JsonView stays for whole documents.
 */
export const TypedTree = memo(function TypedTree({
  value,
  open = 1,
  className,
}: {
  /** An object or array; its entries are the top rows. */
  value: Record<string, unknown> | unknown[];
  /** Levels open at first. */
  open?: number;
  className?: string;
}) {
  const entries = toEntries(value);
  if (entries.length === 0) return <div className={cn("px-3 py-1 text-sm text-fg-3", className)}>None</div>;
  return (
    <div className={cn("py-0.5 font-data text-[12px]", className)}>
      {entries.map(([k, v]) => (
        <Row key={k} name={k} value={v} depth={0} open={open} index={Array.isArray(value)} />
      ))}
    </div>
  );
});

function toEntries(value: unknown): [string, unknown][] {
  if (Array.isArray(value)) return value.map((v, i) => [String(i), v]);
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>);
  return [];
}

/** The tag at the right: str, int, num, bool, null, obj · n, arr · n. */
export function typeTag(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `arr · ${v.length}`;
  if (typeof v === "object") return `obj · ${Object.keys(v as object).length}`;
  if (typeof v === "number") return Number.isInteger(v) ? "int" : "num";
  if (typeof v === "boolean") return "bool";
  return "str";
}

function Row({ name, value, depth, open, index }: { name: string; value: unknown; depth: number; open: number; index: boolean }) {
  const nested = value !== null && typeof value === "object" && toEntries(value).length > 0;
  const [expanded, setExpanded] = useState(depth < open - 1);
  const body = (
    <>
      <span className="grid w-4 shrink-0 place-items-center text-fg-3">
        {nested && <ChevronRight className={cn("size-3 transition-transform", expanded && "rotate-90")} aria-hidden />}
      </span>
      <span
        className={cn(
          "shrink-0 whitespace-nowrap after:mr-1.5 after:text-json-punct after:content-[':']",
          index ? "text-fg-3" : "text-json-key",
        )}
      >
        {index ? `[${name}]` : name}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {nested ? <span className="text-fg-3">{Array.isArray(value) ? "[…]" : "{…}"}</span> : <Scalar value={value} />}
      </span>
      <span className="shrink-0 pl-2 font-sans text-[10px] whitespace-nowrap text-fg-3">{typeTag(value)}</span>
    </>
  );
  const pad = { paddingLeft: 10 + depth * 14 };
  return (
    <>
      {nested ? (
        <button
          type="button"
          aria-expanded={expanded}
          style={pad}
          className="flex w-full items-center gap-0.5 pr-2.5 text-left leading-5 hover:bg-row-hover"
          onClick={() => setExpanded((e) => !e)}
        >
          {body}
        </button>
      ) : (
        <div style={pad} className="flex items-center gap-0.5 pr-2.5 leading-5 select-text hover:bg-row-hover" title={titleOf(value)}>
          {body}
        </div>
      )}
      {nested &&
        expanded &&
        toEntries(value).map(([k, v]) => (
          <Row key={k} name={k} value={v} depth={depth + 1} open={open} index={Array.isArray(value)} />
        ))}
    </>
  );
}

function titleOf(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 40 ? v : undefined;
}

function Scalar({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-fg-3 italic">null</span>;
  if (typeof value === "boolean") return <span className="text-json-keyword">{String(value)}</span>;
  if (typeof value === "number") return <span className="text-json-number">{String(value)}</span>;
  return <span className="text-json-string">{String(value)}</span>;
}
