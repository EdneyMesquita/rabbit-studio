import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { RowContextMenu } from "@/components/common/ActionMenu";
import type { MenuEntry } from "@/components/common/ActionMenu";
import { useVirtualRows } from "@/components/grid/useVirtualRows";

const HEADER_HEIGHT = 30;

export interface Column<T> {
  id: string;
  header: ReactNode;
  /** Tooltip for the header. */
  title?: string;
  /** CSS width (px number or any length). Unset columns share the rest. */
  width?: number | string;
  align?: "left" | "right";
  /** Mono data font (counts, names, keys): the default. false for UI text. */
  mono?: boolean;
  cell: (row: T, index: number) => ReactNode;
  /** Present when the column sorts; numbers sort numerically. */
  sortValue?: (row: T) => string | number | null | undefined;
}

export interface SortState {
  column: string;
  desc: boolean;
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Selected row keys. */
  selected?: ReadonlySet<string>;
  /**
   * A click selects one row; Ctrl/Cmd-click toggles, Shift-click extends
   * (when `multi`). Receives the new selection.
   */
  onSelectionChange?: (keys: Set<string>, last: string | null) => void;
  multi?: boolean;
  /** Double-click or Enter. */
  onOpen?: (row: T) => void;
  /** The right-click menu of a row (the row is selected first). */
  menu?: (row: T, selectedKeys: Set<string>) => MenuEntry[];
  /** Initial sort; the user's clicks take over. */
  defaultSort?: SortState;
  /** Controlled sort, when the caller sorts on the server. */
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  /** Already sorted by the caller (server-side). */
  manualSort?: boolean;
  /** Muted rows (an idle consumer, a stopped shovel). */
  rowTone?: (row: T) => "muted" | "warn" | "danger" | null;
  empty?: ReactNode;
  "aria-label": string;
  className?: string;
  /** A row key to scroll to and select once it is in the rows. */
  reveal?: string | null;
}

function compare(a: string | number | null | undefined, b: string | number | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * The data views' table: sticky header, 24px rows in the data font,
 * sortable columns, single or multiple selection, keyboard navigation, a
 * right-click menu, and windowed rendering past a few hundred rows.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  selected,
  onSelectionChange,
  multi = false,
  onOpen,
  menu,
  defaultSort,
  sort: controlledSort,
  onSortChange,
  manualSort = false,
  rowTone,
  empty,
  className,
  reveal,
  ...aria
}: DataTableProps<T>) {
  const [ownSort, setOwnSort] = useState<SortState | null>(defaultSort ?? null);
  const sort = controlledSort !== undefined ? controlledSort : ownSort;
  const setSort = (next: SortState | null) => {
    if (controlledSort === undefined) setOwnSort(next);
    onSortChange?.(next);
  };

  const sorted = useMemo(() => {
    if (!sort || manualSort) return rows;
    const col = columns.find((c) => c.id === sort.column);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const out = [...rows].sort((a, b) => compare(get(a), get(b)));
    return sort.desc ? out.reverse() : out;
  }, [rows, columns, sort, manualSort]);

  const scroller = useRef<HTMLDivElement>(null);
  const virtual = useVirtualRows(scroller, sorted.length, HEADER_HEIGHT);
  const anchor = useRef<string | null>(null);
  const menuRow = useRef<T | null>(null);
  const sel = selected ?? EMPTY;

  const indexOf = useCallback(
    (key: string | null) => (key == null ? -1 : sorted.findIndex((r) => rowKey(r) === key)),
    [sorted, rowKey],
  );

  const choose = useCallback(
    (key: string, e?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) => {
      if (!onSelectionChange) return;
      if (multi && e && (e.ctrlKey || e.metaKey)) {
        const next = new Set(sel);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        anchor.current = key;
        onSelectionChange(next, key);
        return;
      }
      if (multi && e?.shiftKey && anchor.current) {
        const a = indexOf(anchor.current);
        const b = indexOf(key);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          onSelectionChange(new Set(sorted.slice(lo, hi + 1).map(rowKey)), key);
          return;
        }
      }
      anchor.current = key;
      onSelectionChange(new Set([key]), key);
    },
    [onSelectionChange, multi, sel, indexOf, sorted, rowKey],
  );

  // Selecting by key from outside (a focus passed with the tab).
  useEffect(() => {
    if (!reveal) return;
    const i = indexOf(reveal);
    if (i < 0) return;
    virtual.reveal(i);
    if (!sel.has(reveal)) choose(reveal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal, sorted.length]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!sorted.length) return;
    const current = indexOf(anchor.current ?? [...sel][0] ?? null);
    const move = (to: number) => {
      const i = Math.max(0, Math.min(sorted.length - 1, to));
      choose(rowKey(sorted[i]), { shiftKey: e.shiftKey });
      virtual.reveal(i);
      e.preventDefault();
    };
    if (e.key === "ArrowDown") move(current + 1);
    else if (e.key === "ArrowUp") move(current < 0 ? 0 : current - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(sorted.length - 1);
    else if (e.key === "PageDown") move(current + 20);
    else if (e.key === "PageUp") move(current - 20);
    else if (e.key === "Enter" && current >= 0 && onOpen) {
      onOpen(sorted[current]);
      e.preventDefault();
    } else if (multi && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && onSelectionChange) {
      onSelectionChange(new Set(sorted.map(rowKey)), anchor.current);
      e.preventDefault();
    }
  }

  const rowFromEvent = (e: MouseEvent): T | null => {
    const tr = (e.target as HTMLElement).closest<HTMLElement>("tr[data-row]");
    if (!tr) return null;
    return sorted[Number(tr.dataset.row)] ?? null;
  };

  const table = (
    <div
      ref={scroller}
      tabIndex={0}
      className={cn("relative min-h-0 min-w-0 flex-1 overflow-auto outline-none", className)}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => {
        const row = rowFromEvent(e);
        menuRow.current = row;
        if (row && !sel.has(rowKey(row))) choose(rowKey(row));
      }}
    >
      <table
        role="grid"
        aria-label={aria["aria-label"]}
        aria-rowcount={sorted.length + 1}
        aria-multiselectable={multi || undefined}
        className="w-full min-w-max table-fixed border-separate border-spacing-0 font-data"
      >
        <colgroup>
          {columns.map((c) => (
            <col key={c.id} style={c.width != null ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.column === c.id;
              const sortable = !!c.sortValue || manualSort;
              return (
                <th
                  key={c.id}
                  scope="col"
                  title={c.title}
                  aria-sort={active ? (sort!.desc ? "descending" : "ascending") : undefined}
                  className={cn(
                    "sticky top-0 z-[2] h-[30px] overflow-hidden border-r border-b border-r-line-soft border-b-line bg-panel px-2.5 font-sans text-sm font-medium text-ellipsis whitespace-nowrap text-fg-2 last:border-r-0",
                    c.align === "right" ? "text-right" : "text-left",
                    sortable && "cursor-pointer select-none hover:text-fg",
                  )}
                  onClick={
                    sortable
                      ? () => setSort(active ? (sort!.desc ? null : { column: c.id, desc: true }) : { column: c.id, desc: false })
                      : undefined
                  }
                >
                  {c.header}
                  {active &&
                    (sort!.desc ? (
                      <ArrowDown className="ml-1 inline size-3 align-[-2px] text-accent-text" aria-hidden />
                    ) : (
                      <ArrowUp className="ml-1 inline size-3 align-[-2px] text-accent-text" aria-hidden />
                    ))}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {virtual.padTop > 0 && (
            <tr aria-hidden style={{ height: virtual.padTop }}>
              <td colSpan={columns.length} className="p-0" />
            </tr>
          )}
          {Array.from({ length: virtual.end - virtual.start }, (_, offset) => {
            const i = virtual.start + offset;
            const row = sorted[i];
            const key = rowKey(row);
            return (
              <Row
                key={key}
                position={i}
                row={row}
                rowKeyValue={key}
                columns={columns}
                selected={sel.has(key)}
                tone={rowTone?.(row) ?? null}
                onChoose={choose}
                onOpen={onOpen}
              />
            );
          })}
          {virtual.padBottom > 0 && (
            <tr aria-hidden style={{ height: virtual.padBottom }}>
              <td colSpan={columns.length} className="p-0" />
            </tr>
          )}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="px-3 py-3 font-sans text-sm text-fg-3">{empty ?? "Nothing here."}</div>
      )}
    </div>
  );

  if (!menu) return table;
  return (
    <RowContextMenu entries={() => (menuRow.current ? menu(menuRow.current, new Set(sel)) : [])}>{table}</RowContextMenu>
  );
}

const EMPTY: ReadonlySet<string> = new Set();

interface RowProps<T> {
  position: number;
  row: T;
  rowKeyValue: string;
  columns: Column<T>[];
  selected: boolean;
  tone: "muted" | "warn" | "danger" | null;
  onChoose: (key: string, e?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) => void;
  onOpen?: (row: T) => void;
}

function RowImpl<T>({ position, row, rowKeyValue, columns, selected, tone, onChoose, onOpen }: RowProps<T>) {
  return (
    <tr
      data-row={position}
      aria-selected={selected}
      className="group/row cursor-default scroll-mt-[30px]"
      onMouseDown={(e) => {
        if (e.button === 0) onChoose(rowKeyValue, e);
      }}
      onDoubleClick={onOpen ? () => onOpen(row) : undefined}
    >
      {columns.map((c) => (
        <td
          key={c.id}
          className={cn(
            "h-6 overflow-hidden border-b border-line-soft px-2.5 text-ellipsis whitespace-nowrap",
            c.align === "right" && "text-right tabular-nums",
            c.mono === false && "font-sans text-base",
            selected ? "bg-sel-soft" : "group-hover/row:bg-row-hover",
            tone === "muted" && "text-fg-3",
            tone === "warn" && "text-warn",
            tone === "danger" && "text-danger",
          )}
        >
          {c.cell(row, position)}
        </td>
      ))}
    </tr>
  );
}

const Row = memo(RowImpl) as typeof RowImpl;
