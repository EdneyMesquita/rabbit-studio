import { useEffect } from "react";
import { toast } from "sonner";
import { invalidate } from "../../hooks/useLive";
import { SPLIT_LAYOUT_ORDER } from "../../lib/editorLayout";
import { useDialogStore } from "../../store/dialogStore";
import { useEditorLayoutStore } from "../../store/editorLayoutStore";
import { selectActiveTab, useSessionsStore } from "../../store/sessionsStore";
import { useUiStore } from "../../store/uiStore";

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/** Refetches everything the active tab's cluster shows (F5). */
export function refreshActive() {
  const tab = selectActiveTab(useSessionsStore.getState());
  if (tab?.connection) invalidate(`${tab.connection.id}:`);
  // The global view reads every cluster.
  else if (tab) invalidate("");
}

/** Activates the tab `step` places from the active one, wrapping. */
function cycleTabs(step: number) {
  const { tabs, activeTabId } = useSessionsStore.getState();
  if (tabs.length < 2) return;
  const at = tabs.findIndex((t) => t.id === activeTabId);
  const next = tabs[(at + step + tabs.length) % tabs.length];
  useEditorLayoutStore.getState().showTab(next.id);
}

/**
 * App-wide keys: Ctrl/Cmd+K or P quick open, Ctrl/Cmd+B the Explorer,
 * Ctrl/Cmd+N a new connection, Ctrl/Cmd+W close the tab, Ctrl+Tab and
 * Ctrl+Shift+Tab cycle tabs, F5 refresh the active cluster, Ctrl/Cmd+\ the
 * tab to the side, Ctrl/Cmd+Alt+1-4 a split layout. Ctrl/Cmd+A only
 * selects inside text fields. Caught in the capture phase, before views.
 */
export function useGlobalShortcuts() {
  useEffect(() => {
    /** Ctrl+Alt+1-4 and Ctrl+\: by key position, as Ctrl+Alt is AltGr on many layouts. */
    function onLayoutKey(e: KeyboardEvent): boolean {
      const digit = /^Digit([1-4])$/.exec(e.code);
      if (e.altKey && digit) {
        useEditorLayoutStore.getState().setLayout(SPLIT_LAYOUT_ORDER[Number(digit[1]) - 1]);
        return true;
      }
      if (!e.altKey && e.key === "\\") {
        const active = useSessionsStore.getState().activeTabId;
        if (active && !useEditorLayoutStore.getState().openToSide(active)) {
          toast("All four panes are in use", { description: "Close a pane, or drop the tab onto one to replace it." });
        }
        return true;
      }
      return false;
    }

    function handled(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      const ui = useUiStore.getState();
      // A dialog is modal; nothing opens or closes behind it.
      const modal = ui.connectionDialog !== null || ui.importExportOpen || useDialogStore.getState().open !== null;

      // F5 would reload the page; here it refetches the active cluster.
      if (e.key === "F5" && !e.ctrlKey && !e.metaKey) {
        handled(e);
        if (!modal) refreshActive();
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "Tab" && e.ctrlKey && !e.altKey) {
        handled(e);
        if (!modal) cycleTabs(e.shiftKey ? -1 : 1);
        return;
      }
      if (e.shiftKey) return;
      // Select all belongs to text fields; elsewhere it would select the whole window.
      if (!e.altKey && e.key.toLowerCase() === "a" && !isEditable(e.target)) {
        e.preventDefault();
        return;
      }
      if (modal) return;
      if (onLayoutKey(e)) return handled(e);
      if (e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "k" || key === "p") ui.setPaletteOpen(!ui.paletteOpen);
      else if (key === "b") ui.toggleSidePanel("explorer");
      else if (key === "n") {
        ui.setPaletteOpen(false);
        ui.setConnectionDialog({ mode: "new" });
      } else if (key === "w") {
        const active = useSessionsStore.getState().activeTabId;
        if (active) useSessionsStore.getState().closeTab(active);
      } else return;
      handled(e);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
