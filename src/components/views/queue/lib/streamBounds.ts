import { useLive } from "@/hooks/useLive";
import { rabbit } from "@/lib/rabbit/client";
import { api } from "@/lib/tauri";
import { hasAmqp } from "./transfer";

export interface StreamBounds {
  first: number | null;
}

/**
 * A stream's first offset. The management API only reports offsets while a
 * consumer is attached (4.x), so it is read off the log itself - one
 * message from the start, over AMQP, once a minute while the tab shows.
 * Retained offsets are contiguous: the last is first + messages - 1.
 */
export function useStreamBounds(cid: string, vhost: string, name: string, enabled: boolean) {
  const on = enabled && !!cid && hasAmqp(cid);
  return useLive<StreamBounds>(
    on ? `${cid}:stream-bounds:${vhost}:${name}` : null,
    async () => {
      const sid = rabbit(cid).sessionId();
      const first = await api.readStream(sid, crypto.randomUUID(), vhost, name, { kind: "first" }, 1, 16);
      return { first: first[0]?.offset ?? null };
    },
    { interval: 60_000, enabled: on },
  );
}
