import { memo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A JSON value as a foldable tree in the data font, colored by type: how
 * payloads, headers, arguments and definitions are shown.
 */
export const JsonView = memo(function JsonView({
  value,
  defaultDepth = 2,
  className,
}: {
  value: unknown;
  /** Levels open at first. */
  defaultDepth?: number;
  className?: string;
}) {
  return (
    <div className={cn("font-data text-fg select-text", className)}>
      <Node value={value} depth={0} open={defaultDepth} label={null} last />
    </div>
  );
});

function Node({
  value,
  depth,
  open,
  label,
  last,
}: {
  value: unknown;
  depth: number;
  open: number;
  label: string | null;
  last: boolean;
}) {
  const container = value !== null && typeof value === "object";
  const [expanded, setExpanded] = useState(depth < open);
  const pad = { paddingLeft: depth * 14 };
  const key =
    label != null ? (
      <>
        <span className="text-json-key">{JSON.stringify(label)}</span>
        <span className="text-json-punct">: </span>
      </>
    ) : null;
  const comma = last ? null : <span className="text-json-punct">,</span>;

  if (!container) {
    return (
      <div style={pad} className="pl-4 break-all whitespace-pre-wrap">
        {key}
        <Scalar value={value} />
        {comma}
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries: [string, unknown][] = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);
  const [openB, closeB] = isArray ? ["[", "]"] : ["{", "}"];
  if (entries.length === 0) {
    return (
      <div style={pad} className="pl-4">
        {key}
        <span className="text-json-punct">
          {openB}
          {closeB}
        </span>
        {comma}
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        style={pad}
        className="flex w-full items-center text-left hover:bg-row-hover"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <ChevronRight
          className={cn("mr-0.5 size-3.5 shrink-0 text-fg-3 transition-transform", expanded && "rotate-90")}
          aria-hidden
        />
        {key}
        <span className="text-json-punct">{openB}</span>
        {!expanded && (
          <>
            <span className="px-1 text-fg-3">
              {entries.length} {isArray ? (entries.length === 1 ? "item" : "items") : entries.length === 1 ? "key" : "keys"}
            </span>
            <span className="text-json-punct">{closeB}</span>
            {comma}
          </>
        )}
      </button>
      {expanded && (
        <>
          {entries.map(([k, v], i) => (
            <Node
              key={k}
              value={v}
              depth={depth + 1}
              open={open}
              label={isArray ? null : k}
              last={i === entries.length - 1}
            />
          ))}
          <div style={pad} className="pl-4 text-json-punct">
            {closeB}
            {comma}
          </div>
        </>
      )}
    </div>
  );
}

function Scalar({ value }: { value: unknown }) {
  if (value === null) return <span className="text-json-keyword">null</span>;
  if (typeof value === "boolean") return <span className="text-json-keyword">{String(value)}</span>;
  if (typeof value === "number") return <span className="text-json-number">{String(value)}</span>;
  if (typeof value === "string") return <span className="text-json-string">{JSON.stringify(value)}</span>;
  return <span className="text-fg-2">{String(value)}</span>;
}

/** Parses text as JSON, or says it isn't. */
export function tryJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const t = text.trim();
  if (!t || (t[0] !== "{" && t[0] !== "[")) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(t) };
  } catch {
    return { ok: false };
  }
}
