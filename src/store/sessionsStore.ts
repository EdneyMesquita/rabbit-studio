import { create } from "zustand";

/** The connection a tab was opened on, as shown on the tab. */
export interface TabConnection {
  id: string;
  name: string;
  /** Management URL with credentials masked. */
  summary: string;
}

export type AdminSection =
  | "users"
  | "vhosts"
  | "policies"
  | "limits"
  | "flags"
  | "federation"
  | "shovels"
  | "definitions";

export const ADMIN_SECTIONS: { id: AdminSection; label: string }[] = [
  { id: "users", label: "Users" },
  { id: "vhosts", label: "Virtual hosts" },
  { id: "policies", label: "Policies" },
  { id: "limits", label: "Limits" },
  { id: "flags", label: "Feature flags" },
  { id: "federation", label: "Federation" },
  { id: "shovels", label: "Shovels" },
  { id: "definitions", label: "Definitions" },
];

/**
 * What a tab shows. Lists take an optional vhost (null: every vhost);
 * `queue`/`exchange`/`stream` show one object.
 */
export type TabKind =
  | "global"
  | "overview"
  | "topology"
  | "nodes"
  | "connections"
  | "channels"
  | "queues"
  | "exchanges"
  | "streams"
  | "queue"
  | "exchange"
  | "admin";

export interface Tab {
  id: string;
  kind: TabKind;
  /** null for the global (every cluster) view. */
  connection: TabConnection | null;
  vhost: string | null;
  /** The queue's or exchange's name. */
  name: string | null;
  section: AdminSection | null;
  /** The tab's own sub-view: a queue's "messages", an exchange's "publish"... */
  view: string | null;
  /** Something to select once it shows: a row name, a message fingerprint. */
  focus: string | null;
}

export interface TabSpec {
  kind: TabKind;
  connection?: TabConnection | null;
  vhost?: string | null;
  name?: string | null;
  section?: AdminSection | null;
  view?: string | null;
  focus?: string | null;
}

/** The identity of what a tab shows: opening it again focuses that tab. */
export function tabKey(spec: TabSpec): string {
  return [spec.kind, spec.connection?.id ?? "*", spec.vhost ?? "*", spec.name ?? "", spec.section ?? ""].join("\u0000");
}

interface SessionsState {
  tabs: Tab[];
  activeTabId: string | null;
  /** Focuses the tab showing `spec`, opening one if needed; returns its id. */
  open: (spec: TabSpec, options?: { background?: boolean }) => string;
  activateTab: (id: string) => void;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeAllTabs: () => void;
  setView: (id: string, view: string | null) => void;
  setFocus: (id: string, focus: string | null) => void;
  /** Forgets a connection going away: its tabs. */
  closeConnection: (connectionId: string) => void;
  renameConnection: (connection: TabConnection) => void;
  /** Moves a tab to `index` in the strip. */
  moveTab: (id: string, index: number) => void;
}

export function selectActiveTab(s: SessionsState): Tab | null {
  return s.tabs.find((t) => t.id === s.activeTabId) ?? null;
}

/** After closing `closed`, the tab to show: the one to its right, else left. */
function nextActive(tabs: Tab[], closedIndex: number): string | null {
  return tabs[closedIndex]?.id ?? tabs[closedIndex - 1]?.id ?? null;
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  open: (spec, options) => {
    const key = tabKey(spec);
    const existing = get().tabs.find((t) => t.id === key);
    if (existing) {
      set((s) => ({
        activeTabId: options?.background ? s.activeTabId : key,
        tabs:
          spec.view !== undefined || spec.focus !== undefined
            ? s.tabs.map((t) =>
                t.id === key
                  ? { ...t, view: spec.view !== undefined ? spec.view : t.view, focus: spec.focus !== undefined ? spec.focus : t.focus }
                  : t,
              )
            : s.tabs,
      }));
      return key;
    }
    const tab: Tab = {
      id: key,
      kind: spec.kind,
      connection: spec.connection ?? null,
      vhost: spec.vhost ?? null,
      name: spec.name ?? null,
      section: spec.section ?? null,
      view: spec.view ?? null,
      focus: spec.focus ?? null,
    };
    set((s) => {
      // A new tab opens right of the active one, like an IDE.
      const at = s.tabs.findIndex((t) => t.id === s.activeTabId);
      const tabs = [...s.tabs];
      tabs.splice(at < 0 ? tabs.length : at + 1, 0, tab);
      return { tabs, activeTabId: options?.background && s.activeTabId ? s.activeTabId : key };
    });
    return key;
  },

  activateTab: (id) => set({ activeTabId: id }),

  closeTab: (id) =>
    set((s) => {
      const index = s.tabs.findIndex((t) => t.id === id);
      if (index < 0) return s;
      const tabs = s.tabs.filter((t) => t.id !== id);
      return { tabs, activeTabId: s.activeTabId === id ? nextActive(tabs, index) : s.activeTabId };
    }),

  closeOtherTabs: (id) => set((s) => ({ tabs: s.tabs.filter((t) => t.id === id), activeTabId: id })),

  closeAllTabs: () => set({ tabs: [], activeTabId: null }),

  setView: (id, view) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, view } : t)) })),

  setFocus: (id, focus) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, focus } : t)) })),

  closeConnection: (connectionId) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.connection?.id !== connectionId);
      const active = tabs.some((t) => t.id === s.activeTabId) ? s.activeTabId : (tabs[0]?.id ?? null);
      return { tabs, activeTabId: active };
    }),

  renameConnection: (connection) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.connection?.id === connection.id ? { ...t, connection } : t)),
    })),

  moveTab: (id, index) =>
    set((s) => {
      const from = s.tabs.findIndex((t) => t.id === id);
      if (from < 0) return s;
      const tabs = [...s.tabs];
      const [tab] = tabs.splice(from, 1);
      tabs.splice(Math.max(0, Math.min(index, tabs.length)), 0, tab);
      return { tabs };
    }),
}));
