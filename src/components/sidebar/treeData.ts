import { useLive } from "../../hooks/useLive";
import { rabbit } from "../../lib/rabbit/client";
import { paths, withQuery } from "../../lib/rabbit/paths";
import { tabKey, useSessionsStore, type TabSpec } from "../../store/sessionsStore";
import { useUiStore } from "../../store/uiStore";
import type { Exchange, Overview, Page, Queue, VHost } from "../../types/rabbit";
import { nodeProblems, queueProblem, type Problem, type ProblemNode } from "../views/problems/issues";

/**
 * What the Explorer reads from the brokers. Every key is under
 * `${cid}:tree:` (or the shared `${cid}:vhosts`), apart from the views'
 * own: the same key with another fetcher would hand a view the wrong shape.
 * Nothing polls while the Explorer is hidden or the node is closed.
 */

/** Most objects a folder lists; the list tab has the rest. */
export const TREE_PAGE = 500;

/** Slower than views: the tree only shows counts and marks. */
const TREE_INTERVAL = 15_000;

/** Whether the Explorer is on screen (it stays mounted while hidden). */
export function useExplorerShown(): boolean {
  return useUiStore((s) => s.sidePanel === "explorer");
}

/** Whether the active tab shows `spec` on connection `cid`: the row to highlight. */
export function useIsActiveTab(cid: string | null, spec: Omit<TabSpec, "connection">): boolean {
  const key = tabKey({ ...spec, connection: cid ? { id: cid, name: "", summary: "" } : null });
  return useSessionsStore((s) => s.activeTabId === key);
}

export function useVhosts(cid: string, enabled: boolean) {
  return useLive(`${cid}:vhosts`, () => rabbit(cid).get<VHost[]>(withQuery(paths.vhosts, { columns: "name,messages" })), {
    enabled,
  });
}

export type TreeQueue = Pick<Queue, "name" | "messages" | "messages_ready" | "messages_unacknowledged" | "consumers" | "type" | "state">;
export type TreeExchange = Pick<Exchange, "name" | "type">;

export function useTreeQueues(cid: string, vhost: string, enabled: boolean) {
  return useLive(
    `${cid}:tree:${vhost}:queues`,
    () =>
      rabbit(cid).get<Page<TreeQueue>>(
        withQuery(paths.queues(vhost), {
          columns: "name,messages,messages_ready,messages_unacknowledged,consumers,type,state",
          page: 1,
          page_size: TREE_PAGE,
        }),
      ),
    { enabled, interval: TREE_INTERVAL },
  );
}

/** The default exchange and amq.* are the broker's own: lists leave them out. */
export function isSystemExchange(name: string): boolean {
  return name === "" || name.startsWith("amq.");
}

export function useTreeExchanges(cid: string, vhost: string, enabled: boolean) {
  return useLive(
    `${cid}:tree:${vhost}:exchanges`,
    () =>
      rabbit(cid).get<Page<TreeExchange>>(
        withQuery(paths.exchanges(vhost), { columns: "name,type", page: 1, page_size: TREE_PAGE }),
      ),
    { enabled, interval: TREE_INTERVAL },
  );
}

/** Connection and channel counts for the Runtime folder. */
export function useTreeTotals(cid: string, enabled: boolean) {
  return useLive(
    `${cid}:tree:totals`,
    () => rabbit(cid).get<Pick<Overview, "object_totals">>(withQuery(paths.overview, { columns: "object_totals" })),
    { enabled, interval: TREE_INTERVAL },
  );
}

/** A connection's problems the tree can afford to watch: its nodes' (down, alarms, limits). */
export function useNodeProblems(cid: string, enabled: boolean): Problem[] {
  const { data } = useLive(
    `${cid}:tree:nodes`,
    () =>
      rabbit(cid).get<ProblemNode[]>(
        withQuery(paths.nodes, {
          columns: "name,running,mem_alarm,mem_used,mem_limit,disk_free_alarm,disk_free,disk_free_limit,fd_used,fd_total,sockets_used,sockets_total,partitions",
        }),
      ),
    { enabled, interval: TREE_INTERVAL },
  );
  return (data ?? []).flatMap(nodeProblems);
}

/** How a queue reads in the tree, by the Problems panel's own rules: hot, warm, or quiet. */
export function queueTone(q: TreeQueue, vhost: string): "hot" | "warm" | null {
  const problem = queueProblem({ ...q, vhost });
  return problem ? (problem.severity === "crit" ? "hot" : "warm") : null;
}
