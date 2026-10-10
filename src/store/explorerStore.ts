import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Tab } from "./sessionsStore";
import { useConnectionsStore } from "./connectionsStore";

/**
 * Which Explorer nodes are open. Node ids:
 * - `f:<environment>` an environment folder (open unless closed)
 * - `c:<cid>` a connection (opens when it connects)
 * - `r:<cid>` its Runtime folder, `a:<cid>` its Admin folder
 * - `v:<cid>:<vhost>` a vhost
 * - `g:<cid>:<vhost>:<queues|exchanges|streams>` an object folder
 */
export const folderNode = (env: string) => `f:${env}`;
export const connectionNode = (cid: string) => `c:${cid}`;
export const runtimeNode = (cid: string) => `r:${cid}`;
export const adminNode = (cid: string) => `a:${cid}`;
export const vhostNode = (cid: string, vhost: string) => `v:${cid}:${vhost}`;
export type ObjectGroup = "queues" | "exchanges" | "streams";
export const groupNode = (cid: string, vhost: string, group: ObjectGroup) => `g:${cid}:${vhost}:${group}`;

interface ExplorerState {
  /** Explicit states; a node missing here takes its default (folders open, the rest closed). */
  open: Record<string, boolean>;
  toggle: (id: string) => void;
  setOpen: (id: string, open: boolean) => void;
  /** Opens every node above what `tab` shows, so its row is in view. */
  reveal: (tab: Tab) => void;
}

/** Whether a node is open, given its explicit state and its default. */
export function isOpen(open: Record<string, boolean>, id: string): boolean {
  return open[id] ?? id.startsWith("f:");
}

const RUNTIME_KINDS = new Set(["nodes", "connections", "channels"]);

export const useExplorerStore = create<ExplorerState>()(
  persist(
    (set, get) => ({
      open: {},
      toggle: (id) => set((s) => ({ open: { ...s.open, [id]: !isOpen(s.open, id) } })),
      setOpen: (id, value) => set((s) => (isOpen(s.open, id) === value ? s : { open: { ...s.open, [id]: value } })),

      reveal: (tab) => {
        const cid = tab.connection?.id;
        if (!cid) return;
        const profile = useConnectionsStore.getState().profiles.find((p) => p.id === cid);
        const ids = [connectionNode(cid)];
        if (profile) ids.push(folderNode(profile.environment));
        if (RUNTIME_KINDS.has(tab.kind)) ids.push(runtimeNode(cid));
        if (tab.kind === "admin") ids.push(adminNode(cid));
        if (tab.vhost !== null && ["queue", "exchange", "queues", "exchanges", "streams"].includes(tab.kind)) {
          ids.push(vhostNode(cid, tab.vhost));
          // A queue tab doesn't say whether it's a stream; both folders share one fetch.
          if (tab.kind === "queue") ids.push(groupNode(cid, tab.vhost, "queues"), groupNode(cid, tab.vhost, "streams"));
          if (tab.kind === "exchange") ids.push(groupNode(cid, tab.vhost, "exchanges"));
        }
        const open = get().open;
        if (ids.every((id) => isOpen(open, id))) return;
        set({ open: { ...open, ...Object.fromEntries(ids.map((id) => [id, true])) } });
      },
    }),
    {
      name: "rabbit-studio-explorer",
      // Environment folders are a lasting arrangement; the rest follows the session.
      partialize: (s) => ({ open: Object.fromEntries(Object.entries(s.open).filter(([k]) => k.startsWith("f:"))) }),
    },
  ),
);
