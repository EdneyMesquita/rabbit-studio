import { useConnectionColor } from "../../lib/connectionColor";
import { useConnectionsStore } from "../../store/connectionsStore";
import type { ActiveSession } from "../../store/connectionsStore";
import { selectActiveTab, useSessionsStore } from "../../store/sessionsStore";
import type { Tab, TabConnection } from "../../store/sessionsStore";
import type { ConnectionProfileMeta } from "../../types/connection";

export interface ActiveConnection {
  tab: Tab;
  /** Null for the global (every cluster) tab. */
  connection: TabConnection | null;
  /** The connection's identity color; the workspace's slate for the global tab. */
  color: string;
  session: ActiveSession | undefined;
  profile: ConnectionProfileMeta | undefined;
}

/**
 * The connection the active tab speaks for - the one the toolbar, the
 * breadcrumb and the status bar name. Null without an active tab.
 */
export function useActiveConnection(): ActiveConnection | null {
  const tab = useSessionsStore(selectActiveTab);
  const connectionId = tab?.connection?.id ?? null;
  const color = useConnectionColor(connectionId);
  const session = useConnectionsStore((s) => (connectionId ? s.sessions[connectionId] : undefined));
  const profile = useConnectionsStore((s) => (connectionId ? s.profiles.find((p) => p.id === connectionId) : undefined));
  if (!tab) return null;
  return { tab, connection: tab.connection, color, session, profile };
}

/** How many clusters are connected right now. */
export function useConnectedCount(): number {
  return useConnectionsStore((s) => Object.keys(s.sessions).length);
}
