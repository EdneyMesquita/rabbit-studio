import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { invalidate } from "@/hooks/useLive";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { enc, paths } from "@/lib/rabbit/paths";
import { api } from "@/lib/tauri";
import { useConnectionsStore } from "@/store/connectionsStore";
import type { TransferInput, TransferProgress, TransferSummary } from "@/types/rabbit";

/** Refetches what a change to a queue's contents or existence touches. */
export function refreshQueues(cid: string) {
  invalidate(`${cid}:queue`); // queue:… and queues:…
  invalidate(`${cid}:vhosts`);
  invalidate(`${cid}:overview`);
}

/** Whether the connection can move chosen messages (AMQP is on). */
export function hasAmqp(cid: string): boolean {
  return useConnectionsStore.getState().sessions[cid]?.amqp ?? false;
}

export function summaryText(s: TransferSummary, verb: string): string {
  const parts = [`${s.done} ${verb}`];
  if (s.skipped) parts.push(`${s.skipped} left in place`);
  if (s.failed) parts.push(`${s.failed} failed (unroutable or no x-death)`);
  if (s.missing) parts.push(`${s.missing} not found (consumed meanwhile)`);
  if (s.cancelled) parts.push("cancelled");
  return parts.join(" · ");
}

export interface RunningTransfer {
  executionId: string;
  label: string;
  done: number;
  total: number;
}

/**
 * Runs transfers (move, replay, delete chosen messages) one at a time with
 * live progress from the `transfer-progress` event, and a cancel.
 */
export function useTransfer(cid: string) {
  const [running, setRunning] = useState<RunningTransfer | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const run = useCallback(
    async (input: TransferInput, label: string, verb: string): Promise<TransferSummary | null> => {
      const executionId = crypto.randomUUID();
      const set = (r: RunningTransfer | null) => alive.current && setRunning(r);
      set({ executionId, label, done: 0, total: input.select?.length ?? input.limit ?? 0 });
      // Listen first: the backend reports progress(0, total) right away.
      const unlisten = await listen<TransferProgress>("transfer-progress", (e) => {
        if (e.payload.executionId === executionId) set({ executionId, label, done: e.payload.done, total: e.payload.total });
      });
      try {
        const summary = await api.transferMessages(rabbit(cid).sessionId(), executionId, input);
        const text = summaryText(summary, verb);
        if (summary.failed || summary.missing) toast.warning(label, { description: text });
        else toast.success(label, { description: text });
        return summary;
      } catch (e) {
        toast.error(`${label} failed`, { description: errorText(e) });
        return null;
      } finally {
        unlisten();
        set(null);
        refreshQueues(cid);
      }
    },
    [cid],
  );

  const cancel = useCallback(() => {
    if (running) void api.cancelTask(running.executionId);
  }, [running]);

  return { running, run, cancel };
}

/**
 * Without AMQP the app can't pick messages, but the broker can still move a
 * whole queue: a one-off dynamic shovel that deletes itself once it has
 * moved what was there when it started.
 */
export async function shovelAll(cid: string, vhost: string, queue: string, target: string): Promise<string> {
  const name = `rabbit-studio-move-${queue}-${Date.now().toString(36)}`;
  // The URI must name the vhost: a bare amqp:// lands in "/".
  const uri = `amqp:///${enc(vhost)}`;
  await rabbit(cid).put(paths.parameter("shovel", vhost, name), {
    value: {
      "src-protocol": "amqp091",
      "src-uri": uri,
      "src-queue": queue,
      "dest-protocol": "amqp091",
      "dest-uri": uri,
      "dest-queue": target,
      "src-delete-after": "queue-length",
    },
  });
  refreshQueues(cid);
  return name;
}
