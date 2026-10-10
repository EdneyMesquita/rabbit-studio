import { useEffect, useState } from "react";
import { rabbit } from "../../lib/rabbit/client";
import { paths, withQuery } from "../../lib/rabbit/paths";
import { useConnectionsStore } from "../../store/connectionsStore";
import type { Exchange, Page, Queue, VHost } from "../../types/rabbit";

/** A queue, exchange or vhost found by name on a connected cluster. */
export interface FoundObject {
  cid: string;
  kind: "queue" | "exchange" | "vhost";
  vhost: string;
  name: string;
  /** Queue type (classic, quorum, stream) or exchange type. */
  type?: string;
  messages?: number;
}

/** Per kind and cluster: enough to pick from, and the server filters, not us. */
const LIMIT = 100;
const DEBOUNCE_MS = 180;

async function searchOne(cid: string, query: string): Promise<FoundObject[]> {
  const api = rabbit(cid);
  // `name` without regex is a substring match on the server, so only matches cross the wire.
  const filter = { page: 1, page_size: LIMIT, name: query, use_regex: false };
  const [queues, exchanges, vhosts] = await Promise.all([
    api
      .get<Page<Pick<Queue, "name" | "vhost" | "messages" | "type">>>(
        withQuery(paths.queues(), { columns: "name,vhost,messages,type", ...filter }),
      )
      .catch(() => null),
    api
      .get<Page<Pick<Exchange, "name" | "vhost" | "type">>>(withQuery(paths.exchanges(), { columns: "name,vhost,type", ...filter }))
      .catch(() => null),
    api.get<Pick<VHost, "name">[]>(withQuery(paths.vhosts, { columns: "name" })).catch(() => null),
  ]);
  const q = query.toLowerCase();
  const out: FoundObject[] = [];
  for (const v of vhosts ?? []) if (v.name.toLowerCase().includes(q)) out.push({ cid, kind: "vhost", vhost: v.name, name: v.name });
  for (const x of queues?.items ?? []) out.push({ cid, kind: "queue", vhost: x.vhost, name: x.name, type: x.type, messages: x.messages });
  for (const x of exchanges?.items ?? []) {
    if (x.name === "" || x.name.startsWith("amq.")) continue;
    out.push({ cid, kind: "exchange", vhost: x.vhost, name: x.name, type: x.type });
  }
  return out;
}

/**
 * Queues, exchanges and vhosts whose name contains `query`, across every
 * connected cluster: one debounced round per query, not a poll. Empty
 * until at least two characters are typed.
 */
export function useBrokerSearch(query: string, enabled = true): { results: FoundObject[]; loading: boolean } {
  const sessions = useConnectionsStore((s) => s.sessions);
  const [state, setState] = useState<{ key: string; results: FoundObject[] }>({ key: "", results: [] });
  const q = query.trim();
  const cids = Object.keys(sessions).sort().join(",");
  const key = enabled && q.length >= 2 ? `${cids}|${q}` : "";

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const lists = await Promise.all(cids.split(",").filter(Boolean).map((cid) => searchOne(cid, q)));
      if (!cancelled) setState({ key, results: lists.flat() });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key, cids, q]);

  if (!key) return { results: [], loading: false };
  // While the next round runs, the last results stay, filtered to what still matches.
  const lower = q.toLowerCase();
  const results = state.key === key ? state.results : state.results.filter((r) => r.name.toLowerCase().includes(lower));
  return { results, loading: state.key !== key };
}
