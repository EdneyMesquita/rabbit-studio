import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, PanelRight, X } from "lucide-react";
import { toast } from "sonner";
import { ActionMenuButton } from "@/components/common/ActionMenu";
import type { MenuEntry } from "@/components/common/ActionMenu";
import { Button } from "@/components/ui/button";
import { isSplit, paneOf } from "../../lib/editorLayout";
import { useEditorLayoutStore } from "../../store/editorLayoutStore";
import { useSessionsStore } from "../../store/sessionsStore";
import type { Tab } from "../../store/sessionsStore";
import { EditorTab } from "./EditorTab";
import { LayoutPicker } from "./LayoutPicker";
import { tabIcon, tabName, tabWhere } from "./tabName";

/** The open tabs, across every cluster, in one flat strip. */
export function TabStrip() {
  const tabs = useSessionsStore((s) => s.tabs);
  const activeTabId = useSessionsStore((s) => s.activeTabId);
  const closeTab = useSessionsStore((s) => s.closeTab);
  const closeOtherTabs = useSessionsStore((s) => s.closeOtherTabs);
  const closeAllTabs = useSessionsStore((s) => s.closeAllTabs);
  const layout = useEditorLayoutStore((s) => s.layout);
  const panes = useEditorLayoutStore((s) => s.panes);
  const focused = useEditorLayoutStore((s) => s.focused);
  const [strip, setStrip] = useState<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  const state = { layout, panes, focused, maximized: null };
  const split = isSplit(state);
  // In a split the selected tab is the focused pane's, which may be empty.
  const selected = split ? panes[focused] : activeTabId;

  // Tabs past the strip's edge are listed in a menu at its end.
  const measure = useCallback(() => {
    if (strip) setOverflowing(strip.scrollWidth > strip.clientWidth + 1);
  }, [strip]);
  useEffect(() => {
    if (!strip) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [strip, measure, tabs]);

  if (tabs.length === 0) return null;

  const tabMenu = (tab: Tab) => (): MenuEntry[] => {
    const layoutStore = useEditorLayoutStore.getState();
    const entries: MenuEntry[] = [
      { label: "Close", icon: X, shortcut: "Ctrl W", onSelect: () => closeTab(tab.id) },
      { label: "Close others", onSelect: () => closeOtherTabs(tab.id), disabled: tabs.length < 2 },
      { label: "Close all", onSelect: closeAllTabs },
      { separator: true },
      {
        label: "Open to the side",
        icon: PanelRight,
        shortcut: "Ctrl \\",
        onSelect: () => {
          if (!layoutStore.openToSide(tab.id)) toast("All four panes are in use", { description: "Close a pane, or drop the tab onto one to replace it." });
        },
      },
    ];
    if (split) {
      panes.forEach((p, i) => {
        if (p !== tab.id) entries.push({ label: `Open in pane ${i + 1}${p ? "" : " (empty)"}`, onSelect: () => layoutStore.openInPane(tab.id, i) });
      });
    }
    return entries;
  };

  return (
    <div className="flex h-9 shrink-0 border-b border-line bg-editor">
      <div
        ref={setStrip}
        role="tablist"
        aria-label="Open tabs"
        // No visible scrollbar - it would squeeze the labels - so a plain mouse
        // wheel scrolls the strip sideways instead, like editor tab bars.
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto scrollbar-none"
        onWheel={(e) => {
          if (e.deltaX === 0) e.currentTarget.scrollLeft += e.deltaY;
        }}
      >
        {tabs.map((t) => {
          const p = paneOf(state, t.id);
          return (
            <EditorTab
              key={t.id}
              tab={t}
              active={t.id === selected}
              entries={tabMenu(t)}
              pane={p >= 0 ? p : null}
              paneFocused={p === focused}
            />
          );
        })}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 border-l border-line-soft px-1">
        <LayoutPicker />
      </div>
      {overflowing && (
        <ActionMenuButton
          label="All open tabs"
          align="end"
          entries={() => [
            { heading: "Open tabs" },
            ...tabs.map((t) => ({
              label: `${tabName(t)} · ${tabWhere(t)}`,
              icon: t.id === selected ? Check : tabIcon(t),
              onSelect: () => useEditorLayoutStore.getState().showTab(t.id),
            })),
          ]}
          trigger={
            <Button variant="ghost" size="icon" title="All open tabs" aria-label="All open tabs" className="h-full w-8 rounded-none border-l border-line-soft">
              <ChevronDown className="size-3.5" />
            </Button>
          }
        />
      )}
    </div>
  );
}
