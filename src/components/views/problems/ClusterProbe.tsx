import { useEffect } from "react";
import { useLive } from "@/hooks/useLive";

/**
 * Polls one cluster for a view that watches several (the problems panel,
 * the all-clusters view) and hands the answer up. Hooks can't loop, so
 * each cluster gets one of these; it renders nothing.
 */
export function ClusterProbe<T>({
  connectionId,
  liveKey,
  fetcher,
  onData,
  interval,
}: {
  connectionId: string;
  /** Must start with `${connectionId}:`. */
  liveKey: string;
  fetcher: () => Promise<T>;
  onData: (connectionId: string, data: T | undefined, error: string | null) => void;
  interval?: number;
}) {
  const live = useLive<T>(liveKey, fetcher, { interval });
  useEffect(() => {
    onData(connectionId, live.data, live.error);
  }, [connectionId, live.data, live.error, onData]);
  return null;
}
