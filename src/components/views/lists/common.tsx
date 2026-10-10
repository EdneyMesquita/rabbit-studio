import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { int } from "@/lib/rabbit/format";
import { useLive, forget } from "@/hooks/useLive";
import { rabbit } from "@/lib/rabbit/client";
import { withQuery, type Query } from "@/lib/rabbit/paths";
import type { Page } from "@/types/rabbit";

/** Pieces the list and runtime views share: paging, filtering, small cells. */

/** Rows per request: the API's own ceiling for a page. */
export const PAGE_SIZE = 500;

/** A paged answer's rows; unpaged servers answer with a bare array. */
export function rowsOf<T>(answer: Page<T> | T[] | undefined): T[] {
  if (!answer) return [];
  return Array.isArray(answer) ? answer : (answer.items ?? []);
}

export interface PageInfo {
  page: number;
  pageCount: number;
  /** Matching the filter / on the server. */
  filtered: number;
  total: number;
}

export function pageInfoOf<T>(answer: Page<T> | T[] | undefined): PageInfo {
  if (!answer) return { page: 1, pageCount: 1, filtered: 0, total: 0 };
  if (Array.isArray(answer)) return { page: 1, pageCount: 1, filtered: answer.length, total: answer.length };
  return {
    page: answer.page ?? 1,
    pageCount: Math.max(1, answer.page_count ?? 1),
    filtered: answer.filtered_count ?? answer.item_count ?? 0,
    total: answer.total_count ?? answer.filtered_count ?? 0,
  };
}

/** A value that follows `value` after it has been still for `ms`: typing doesn't hit the server per key. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Whether a filter reads as a regular expression: it has operators a name never does ("." alone is a name). */
export function looksLikeRegex(text: string): boolean {
  return /[\^$*+?()[\]{}|\\]/.test(text);
}

/** The server-side name filter of a list. */
export function nameQuery(text: string): { name?: string; use_regex?: boolean } {
  const t = text.trim();
  if (!t) return {};
  return looksLikeRegex(t) ? { name: t, use_regex: true } : { name: t };
}

export function copyText(text: string, what = "Name") {
  void navigator.clipboard
    .writeText(text)
    .then(() => toast(`${what} copied`, { description: text }))
    .catch(() => toast.error("Could not copy"));
}

/** A count that is zero reads quieter than the others. */
export function Zero({ n, warn, danger }: { n: number | null | undefined; warn?: boolean; danger?: boolean }) {
  if (n == null) return <span className="text-fg-3">–</span>;
  if (n === 0) return <span className="text-fg-3">0</span>;
  return <span className={cn(danger ? "text-danger" : warn ? "text-warn" : undefined)}>{int(n)}</span>;
}

/** A rate with the unit; 0 reads quieter. */
export function RateCell({ rate }: { rate: number | null | undefined }) {
  if (rate == null) return <span className="text-fg-3">–</span>;
  if (rate === 0) return <span className="text-fg-3">0</span>;
  return <>{rate < 10 ? rate.toFixed(1).replace(/\.0$/, "") : int(rate)}/s</>;
}

/** The strip under a toolbar: what is shown, in what scope, paging at the right. */
export function ResultsHead({
  count,
  noun,
  scope,
  pager,
  children,
}: {
  count: ReactNode;
  noun: string;
  scope?: ReactNode;
  pager?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-3 border-b border-line bg-editor px-3 text-sm text-fg-2">
      <span>
        <span className="font-mono text-fg tabular-nums">{count}</span> {noun}
      </span>
      {scope && <span className="truncate text-fg-3">{scope}</span>}
      <div className="flex-1" />
      {children}
      {pager}
    </div>
  );
}

/** Previous / next page, only when there is more than one. */
export function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (page: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <span className="inline-flex items-center gap-1 text-fg-2">
      <Button variant="ghost" size="icon-xs" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft />
      </Button>
      <span className="font-mono text-xs tabular-nums">
        {page} / {pageCount}
      </span>
      <Button variant="ghost" size="icon-xs" aria-label="Next page" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        <ChevronRight />
      </Button>
    </span>
  );
}

/** A toggle in a toolbar that reads as pressed. */
export function ToggleButton({
  pressed,
  onToggle,
  children,
  title,
}: {
  pressed: boolean;
  onToggle: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <Button variant="secondary" aria-pressed={pressed} title={title} onClick={onToggle} className={cn(pressed && "border-accent text-accent-text")}>
      {children}
    </Button>
  );
}

/** The tab's connection id; views are only opened on a connection. */
export function connectionIdOf(tab: { connection: { id: string } | null }): string {
  return tab.connection?.id ?? "";
}

/**
 * A paged, server-filtered list polled under a key that carries its query,
 * so a new filter or sort fetches at once. The answer it replaces stays on
 * screen until the new one lands (no flash of "Loading"), and keys of
 * queries left behind are forgotten so typing doesn't pile up cached pages.
 */
export function usePagedList<T>(opts: {
  connectionId: string;
  /** Key part after the connection: "queues:<tab>" - invalidating `${cid}:queues` reaches it. */
  scope: string;
  base: string;
  page: number;
  query: Query;
  enabled: boolean;
}) {
  const { connectionId, scope, base, page, query, enabled } = opts;
  const path = withQuery(base, { page, page_size: PAGE_SIZE, ...query });
  // "#" ends the key so forgetting one query never matches a longer one.
  const key = `${connectionId}:${scope}:${path}#`;
  const live = useLive<Page<T> | T[]>(key, () => rabbit(connectionId).get<Page<T> | T[]>(path), { enabled });

  const latestKey = useRef(key);
  latestKey.current = key;
  useEffect(
    () => () => {
      // Deferred: StrictMode re-runs effects with the same key, which must survive.
      setTimeout(() => {
        if (latestKey.current !== key) forget(key);
      }, 0);
    },
    [key],
  );

  const previous = useRef<Page<T> | T[] | undefined>(undefined);
  if (live.data) previous.current = live.data;
  const answer = live.data ?? previous.current;
  const rows = useMemo(() => rowsOf(answer), [answer]);
  const info = useMemo(() => pageInfoOf(answer), [answer]);
  return { rows, info, answer, error: live.error, loading: live.loading, updatedAt: live.updatedAt, refresh: live.refresh, fresh: !!live.data };
}
