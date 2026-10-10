import { useConnectionsStore } from "@/store/connectionsStore";
import { useSessionsStore, type TabConnection, type TabSpec } from "@/store/sessionsStore";

/** A saved connection as tabs show it. */
export function tabConnection(connectionId: string): TabConnection | null {
  const p = useConnectionsStore.getState().profiles.find((x) => x.id === connectionId);
  return p ? { id: p.id, name: p.name, summary: p.summary } : null;
}

/**
 * Opens (or focuses) a tab on a connection: how views link to each other,
 * e.g. `openOn(id, { kind: "queue", vhost, name, view: "messages" })`.
 */
export function openOn(connectionId: string | null, spec: Omit<TabSpec, "connection">, options?: { background?: boolean }) {
  const connection = connectionId ? tabConnection(connectionId) : null;
  return useSessionsStore.getState().open({ ...spec, connection }, options);
}
