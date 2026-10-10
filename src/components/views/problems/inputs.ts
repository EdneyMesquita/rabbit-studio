import { rabbit } from "@/lib/rabbit/client";
import { paths, withQuery } from "@/lib/rabbit/paths";
import type { NodeInfo, Page, Queue } from "@/types/rabbit";
import type { ProblemNode, ProblemQueue } from "./issues";

/** What the checks in issues.ts read: the cheapest way to answer them. */
export interface ProblemInputs {
  queues: ProblemQueue[];
  nodes: ProblemNode[];
}

/** The queues' counts only: no rates, no arguments, no stats the checks ignore. */
const QUEUE_COLUMNS = "name,vhost,type,state,messages,messages_ready,messages_unacknowledged,consumers";
export const NODE_COLUMNS =
  "name,running,mem_used,mem_limit,mem_alarm,disk_free,disk_free_limit,disk_free_alarm,fd_used,fd_total,sockets_used,sockets_total,partitions";

/**
 * One request each for queues (the 500 deepest) and nodes. The deepest
 * queues are where every problem shows: backlog, dead letters, no consumers.
 */
export async function fetchProblemInputs(connectionId: string): Promise<ProblemInputs> {
  const api = rabbit(connectionId);
  const [queues, nodes] = await Promise.all([
    api.get<Page<Queue> | Queue[]>(
      withQuery(paths.queues(), { columns: QUEUE_COLUMNS, page: 1, page_size: 500, sort: "messages", sort_reverse: true }),
    ),
    api.get<NodeInfo[]>(withQuery(paths.nodes, { columns: NODE_COLUMNS })),
  ]);
  return { queues: Array.isArray(queues) ? queues : (queues.items ?? []), nodes };
}
