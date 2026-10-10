import { useEffect, useState } from "react";
import { shortNode } from "@/lib/rabbit/format";
import type { Queue } from "@/types/rabbit";

/** A change seen between two polls of a queue. */
export interface QueueEvent {
  at: number;
  text: string;
}

interface Track {
  last: Pick<Queue, "consumers" | "policy" | "operator_policy" | "leader" | "online">;
  events: QueueEvent[];
}

const RING = 20;
/** Per queue, kept for the session so a view switch doesn't lose them. */
const tracks = new Map<string, Track>();

function diff(a: Track["last"], b: Track["last"]): string[] {
  const out: string[] = [];
  if ((a.consumers ?? 0) !== (b.consumers ?? 0)) out.push(`consumers ${a.consumers ?? 0} → ${b.consumers ?? 0}`);
  for (const [key, label] of [
    ["policy", "policy"],
    ["operator_policy", "operator policy"],
  ] as const) {
    const [x, y] = [a[key] || null, b[key] || null];
    if (x === y) continue;
    out.push(!x ? `${label} ${y} applied` : !y ? `${label} ${x} removed` : `${label} changed ${x} → ${y}`);
  }
  if (a.leader && b.leader && a.leader !== b.leader) out.push(`leader moved to ${shortNode(b.leader)}`);
  if (a.online && b.online) {
    for (const n of a.online.filter((m) => !b.online!.includes(m))) out.push(`member ${shortNode(n)} went offline`);
    for (const n of b.online.filter((m) => !a.online!.includes(m))) out.push(`member ${shortNode(n)} came back online`);
  }
  return out;
}

/**
 * What changed in a queue between polls while it was open (consumers,
 * policy, leader, members online), newest first. Only real observations:
 * nothing is known about before the first poll.
 */
export function useQueueEvents(cid: string, q: Queue | undefined): QueueEvent[] {
  const key = `${cid}:${q?.vhost}:${q?.name}`;
  const [, bump] = useState(0);
  useEffect(() => {
    if (!q) return;
    const now: Track["last"] = {
      consumers: q.consumers,
      policy: q.policy,
      operator_policy: q.operator_policy,
      leader: q.leader,
      online: q.online,
    };
    const t = tracks.get(key);
    if (!t) {
      tracks.set(key, { last: now, events: [] });
      return;
    }
    const changes = diff(t.last, now);
    t.last = now;
    if (!changes.length) return;
    const at = Date.now();
    t.events = [...changes.map((text) => ({ at, text })), ...t.events].slice(0, RING);
    bump((n) => n + 1);
  }, [q, key]);
  return tracks.get(key)?.events ?? [];
}
