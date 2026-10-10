import { selectActiveTab, useSessionsStore } from "../../store/sessionsStore";

/** The tab last active on each connection, for jumping back to it. */
const lastActive = new Map<string, string>();
/** Tab ids, most recently active first (closed ones are skipped when read). */
let recent: string[] = [];

useSessionsStore.subscribe((state, prev) => {
  if (state.activeTabId === prev.activeTabId) return;
  const tab = selectActiveTab(state);
  if (!tab) return;
  if (tab.connection) lastActive.set(tab.connection.id, tab.id);
  recent = [tab.id, ...recent.filter((id) => id !== tab.id)].slice(0, 50);
});

/**
 * The connection's tab to go back to: the one last active if it's still
 * open, else its rightmost tab, else null when it has none.
 */
export function lastTabOf(connectionId: string): string | null {
  const { tabs } = useSessionsStore.getState();
  const remembered = lastActive.get(connectionId);
  if (remembered && tabs.some((t) => t.id === remembered)) return remembered;
  const own = tabs.filter((t) => t.connection?.id === connectionId);
  return own.length > 0 ? own[own.length - 1].id : null;
}

/** Open tabs, most recently active first; never-activated ones last, in strip order. */
export function recentTabIds(): string[] {
  const open = new Set(useSessionsStore.getState().tabs.map((t) => t.id));
  const seen = recent.filter((id) => open.has(id));
  const rest = [...open].filter((id) => !seen.includes(id));
  return [...seen, ...rest];
}
