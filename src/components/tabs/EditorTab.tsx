import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useEditorLayoutStore } from "../../store/editorLayoutStore";
import { useSessionsStore } from "../../store/sessionsStore";
import type { Tab } from "../../store/sessionsStore";
import { RowContextMenu } from "@/components/common/ActionMenu";
import type { MenuEntry } from "@/components/common/ActionMenu";
import { Button } from "@/components/ui/button";
import { ConnectionChip } from "@/components/ui/ConnectionChip";
import { useConnectionColor } from "@/lib/connectionColor";
import { cn } from "@/lib/utils";
import { tabIcon, tabName, tabWhere } from "./tabName";
import { startTabDrag, useTabDragStore } from "./useTabDrag";
import { PaneNumber } from "./PaneNumber";

interface EditorTabProps {
  tab: Tab;
  active: boolean;
  /** The tab's right-click menu, built when it opens. */
  entries: () => MenuEntry[];
  /** The pane showing it in a split, from 0; null when it's in none. */
  pane?: number | null;
  /** Whether that pane is the focused one. */
  paneFocused?: boolean;
}

/** One tab of the editor strip, underlined in its connection's color when active. */
export function EditorTab({ tab, active, entries, pane = null, paneFocused = false }: EditorTabProps) {
  const showTab = useEditorLayoutStore((s) => s.showTab);
  const closeTab = useSessionsStore((s) => s.closeTab);
  const dropHere = useTabDragStore((s) => s.target?.kind === "tab" && s.target.tabId === tab.id);
  const ref = useRef<HTMLDivElement>(null);
  const color = useConnectionColor(tab.connection?.id ?? null);
  const name = tabName(tab);
  const where = tabWhere(tab);
  const Icon = tabIcon(tab);
  const mono = tab.kind === "queue" || tab.kind === "exchange";

  // A tab opened from the Explorer or the palette may land past the strip's edge.
  // Scrolls only the strip: scrollIntoView would also scroll every clipped
  // ancestor (the editor's <main>), shifting the whole view sideways.
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    let strip = el.parentElement;
    while (strip && strip.scrollWidth <= strip.clientWidth) strip = strip.parentElement;
    if (!strip || strip.tagName === "MAIN") return;
    const a = el.getBoundingClientRect();
    const b = strip.getBoundingClientRect();
    if (a.left < b.left) strip.scrollLeft -= b.left - a.left;
    else if (a.right > b.right) strip.scrollLeft += a.right - b.right;
  }, [active]);

  return (
    <RowContextMenu entries={entries}>
      <div
        ref={ref}
        role="tab"
        aria-selected={active}
        tabIndex={0}
        data-drop-tab={tab.id}
        title={`${name}${tab.vhost && mono ? ` · vhost ${tab.vhost}` : ""}\n${where}${tab.connection ? ` · ${tab.connection.summary}` : ""}${pane !== null ? `\nIn pane ${pane + 1}` : ""}`}
        className={cn(
          "group relative flex max-w-[300px] shrink-0 select-none items-center gap-[7px] whitespace-nowrap pl-3 pr-1.5 text-base",
          active ? "text-fg" : "text-fg-2 hover:bg-row-hover hover:text-fg",
          dropHere && "shadow-[inset_2px_0_0_var(--color-accent)]",
        )}
        onClick={() => showTab(tab.id)}
        onPointerDown={(e) => startTabDrag(e, tab.id, name)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            showTab(tab.id);
          }
        }}
        // Middle-click closes, as in a browser. Swallow the mousedown too, or
        // it starts autoscroll on Linux/Windows.
        onMouseDown={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
        onAuxClick={(e) => {
          if (e.button === 1) closeTab(tab.id);
        }}
      >
        <ConnectionChip name={where} color={color} size="dot" />
        <Icon className="size-3.5 shrink-0 text-fg-2" aria-hidden />
        <span className={cn("min-w-0 truncate", mono && "font-data")}>{name}</span>
        {/* Names the cluster too, so two clusters' "orders" never look alike. */}
        <span className="shrink-0 text-sm text-fg-3">{where}</span>
        {pane !== null && <PaneNumber pane={pane} focused={paneFocused} />}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Close ${name} on ${where}`}
          title="Close (middle-click)"
          data-no-drag=""
          className={cn(
            "text-fg-3",
            active ? "opacity-100" : "opacity-0 group-has-[:focus-visible]:opacity-100 group-hover:opacity-100",
          )}
          onClick={(e) => {
            e.stopPropagation();
            closeTab(tab.id);
          }}
        >
          <X />
        </Button>
        {active && (
          <span
            aria-hidden
            className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-t-[2px]"
            style={{ backgroundColor: color }}
          />
        )}
      </div>
    </RowContextMenu>
  );
}
