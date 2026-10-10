import { useEffect, useState } from "react";
import { LayoutGrid, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invalidate } from "../../hooks/useLive";
import { openOn } from "../../lib/rabbit/nav";
import { useConnectionsStore } from "../../store/connectionsStore";
import { useExplorerStore } from "../../store/explorerStore";
import { selectActiveTab, useSessionsStore } from "../../store/sessionsStore";
import { useUiStore } from "../../store/uiStore";
import { useBrokerSearch } from "../palette/useBrokerSearch";
import { ConnectionTree, SearchResults, useSearchRows } from "./ConnectionTree";
import { ExplorerSearch } from "./ExplorerSearch";
import { PanelHeader } from "./PanelHeader";
import { PanelNotice } from "./PanelNotice";
import { useExplorerShown, useIsActiveTab } from "./treeData";
import { TreeRow } from "./TreeRow";
import { TREE_SCROLLER_ATTR } from "./useWindowedRows";

function newConnection() {
  useUiStore.getState().setConnectionDialog({ mode: "new" });
}

/** Refetches the saved connections and everything the tree shows. */
function refreshAll() {
  void useConnectionsStore.getState().refreshProfiles();
  for (const cid of Object.keys(useConnectionsStore.getState().sessions)) invalidate(`${cid}:`);
}

/** The Explorer tool window: every cluster by environment, and what's in each. */
export function Sidebar() {
  const profiles = useConnectionsStore((s) => s.profiles);
  const profilesLoaded = useConnectionsStore((s) => s.profilesLoaded);
  const secretBackend = useConnectionsStore((s) => s.secretBackend);
  const error = useConnectionsStore((s) => s.error);
  const shown = useExplorerShown();
  const globalSelected = useIsActiveTab(null, { kind: "global" });
  const [search, setSearch] = useState("");
  const searching = search.trim() !== "";
  const { results, loading } = useBrokerSearch(search, searching && shown);
  const { rows, first } = useSearchRows(search, results);

  useEffect(() => {
    const store = useConnectionsStore.getState();
    void store.refreshProfiles();
    void store.loadSecretBackendInfo();
  }, []);

  // The active tab's row comes into view: its ancestors open, then it scrolls in.
  const activeTabId = useSessionsStore((s) => s.activeTabId);
  useEffect(() => {
    const tab = selectActiveTab(useSessionsStore.getState());
    if (!tab) return;
    useExplorerStore.getState().reveal(tab);
    const frame = requestAnimationFrame(() => {
      document
        .querySelector(`[${TREE_SCROLLER_ATTR}] [role="treeitem"][aria-selected="true"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTabId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <PanelHeader title="Explorer">
        <Button variant="ghost" size="icon" title="Refresh" aria-label="Refresh" onClick={refreshAll}>
          <RefreshCw className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" title="New connection (Ctrl N)" aria-label="New connection" onClick={newConnection}>
          <Plus />
        </Button>
      </PanelHeader>

      <ExplorerSearch value={search} onChange={setSearch} onSubmit={() => first?.open?.()} />

      {secretBackend?.warning && <PanelNotice>{secretBackend.warning}</PanelNotice>}
      {error && <PanelNotice>{error}</PanelNotice>}

      <div className="min-h-0 flex-1 overflow-y-auto" {...{ [TREE_SCROLLER_ATTR]: "" }}>
        <div role="tree" aria-label="Clusters" className="flex min-h-full flex-col pt-0.5 pb-3">
          {profiles.length === 0 && profilesLoaded ? (
            <div className="flex flex-col items-start gap-2 px-3 py-2.5 text-sm text-fg-3">
              <p>No connections yet. Add one with its management API URL to browse its queues.</p>
              <Button size="sm" onClick={newConnection}>
                <Plus />
                New connection
              </Button>
            </div>
          ) : searching ? (
            <SearchResults query={search} rows={rows} loading={loading} />
          ) : (
            <>
              <TreeRow
                depth={0}
                selected={globalSelected}
                icon={<LayoutGrid className="size-3.5 shrink-0 text-fg-2" aria-hidden />}
                label="All clusters"
                title="Global overview: health and problems of every connected cluster"
                trailing={<span>{profiles.length}</span>}
                onActivate={() => openOn(null, { kind: "global" })}
              />
              <ConnectionTree shown={shown} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
