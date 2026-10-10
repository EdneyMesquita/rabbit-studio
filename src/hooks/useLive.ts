import { useCallback, useEffect, useSyncExternalStore } from "react";
import { create } from "zustand";

/**
 * The one way views read the broker. Each key is fetched by one poller no
 * matter how many components show it; polling stops when nothing on
 * screen needs the key (a hidden tab passes `enabled: false`), pauses while
 * the window is hidden or live updates are paused, and backs off on
 * errors. Never roll a setInterval of your own: this is what keeps the app
 * light when ten tabs on five clusters are open.
 */

export const DEFAULT_INTERVAL = 5000;
const MAX_BACKOFF = 60_000;

interface Entry {
  data: unknown;
  error: string | null;
  /** When `data` arrived, ms since epoch; 0 before the first answer. */
  updatedAt: number;
  loading: boolean;
  fetcher: () => Promise<unknown>;
  interval: number;
  /** Mounted users that want it polled. */
  active: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setTimeout> | null;
  inflight: Promise<void> | null;
  failures: number;
  /** Bumped on each change, so snapshots compare cheaply. */
  version: number;
}

const entries = new Map<string, Entry>();

interface LiveState {
  /** Live updates paused by the user (status bar). */
  paused: boolean;
  setPaused: (paused: boolean) => void;
  /** Ms since epoch of the last successful answer of any key. */
  lastBeat: number;
}

export const useLiveStore = create<LiveState>((set) => ({
  paused: false,
  setPaused: (paused) => {
    set({ paused });
    if (!paused) for (const [key, e] of entries) if (e.active > 0) schedule(key, 0);
  },
  lastBeat: 0,
}));

function hidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function notify(e: Entry) {
  e.version++;
  for (const l of e.listeners) l();
}

function schedule(key: string, delay: number) {
  const e = entries.get(key);
  if (!e) return;
  if (e.timer) clearTimeout(e.timer);
  e.timer = null;
  if (e.active <= 0) return;
  e.timer = setTimeout(() => void run(key), delay);
}

async function run(key: string, force = false): Promise<void> {
  const e = entries.get(key);
  if (!e) return;
  if (e.inflight) return e.inflight;
  if (!force && (e.active <= 0 || hidden() || useLiveStore.getState().paused)) return;
  e.loading = true;
  notify(e);
  e.inflight = (async () => {
    try {
      e.data = await e.fetcher();
      e.error = null;
      e.updatedAt = Date.now();
      e.failures = 0;
      useLiveStore.setState({ lastBeat: e.updatedAt });
    } catch (err) {
      e.error = err instanceof Error ? err.message : String(err);
      e.failures++;
    } finally {
      e.loading = false;
      e.inflight = null;
      notify(e);
      const delay =
        e.failures > 0 ? Math.min(e.interval * 2 ** e.failures, MAX_BACKOFF) : e.interval;
      if (e.interval > 0) schedule(key, delay);
    }
  })();
  return e.inflight;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (hidden()) return;
    // Back in view: catch up on whatever is shown, now.
    for (const [key, e] of entries) if (e.active > 0 && Date.now() - e.updatedAt > e.interval) schedule(key, 0);
  });
}

function entryFor(key: string, fetcher: () => Promise<unknown>, interval: number): Entry {
  let e = entries.get(key);
  if (!e) {
    e = {
      data: undefined,
      error: null,
      updatedAt: 0,
      loading: false,
      fetcher,
      interval,
      active: 0,
      listeners: new Set(),
      timer: null,
      inflight: null,
      failures: 0,
      version: 0,
    };
    entries.set(key, e);
  }
  return e;
}

/** Refetches a key now (after a change the user made), if anyone shows it. */
export function invalidate(prefix: string) {
  for (const [key, e] of entries) {
    if (key.startsWith(prefix)) {
      if (e.active > 0) void run(key, true);
      else e.updatedAt = 0;
    }
  }
}

/** Forgets every key under `prefix` (a connection that went away). */
export function forget(prefix: string) {
  for (const [key, e] of entries) {
    if (key.startsWith(prefix)) {
      if (e.timer) clearTimeout(e.timer);
      entries.delete(key);
    }
  }
}

export interface Live<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  /** ms since epoch of the data; 0 before it arrived. */
  updatedAt: number;
  refresh: () => Promise<void>;
}

export interface LiveOptions {
  /** ms between fetches; 0 fetches once. Default 5 s. */
  interval?: number;
  /** false stops polling (the data stays cached). */
  enabled?: boolean;
}

/**
 * Polls `fetcher` under `key` while enabled. Keys are namespaced by
 * connection: `${connectionId}:what` - so `forget(connectionId)` and
 * `invalidate(`${connectionId}:queues`)` reach them. A null key reads nothing.
 */
export function useLive<T>(key: string | null, fetcher: () => Promise<T>, options: LiveOptions = {}): Live<T> {
  const interval = options.interval ?? DEFAULT_INTERVAL;
  const enabled = options.enabled ?? true;
  const paused = useLiveStore((s) => s.paused);

  if (key) {
    const e = entryFor(key, fetcher, interval);
    // The latest closure wins (it sees the latest arguments).
    e.fetcher = fetcher;
    e.interval = interval;
  }

  const subscribe = useCallback(
    (cb: () => void) => {
      if (!key) return () => {};
      const e = entries.get(key)!;
      e.listeners.add(cb);
      return () => e.listeners.delete(cb);
    },
    [key],
  );
  const version = useSyncExternalStore(subscribe, () => (key ? entries.get(key)?.version ?? 0 : 0));

  useEffect(() => {
    if (!key || !enabled) return;
    const e = entries.get(key)!;
    e.active++;
    const stale = Date.now() - e.updatedAt >= (e.interval || Infinity) || e.updatedAt === 0;
    if (stale && !paused) schedule(key, 0);
    else if (!e.timer && !e.inflight && e.interval > 0) schedule(key, Math.max(0, e.interval - (Date.now() - e.updatedAt)));
    return () => {
      e.active--;
      if (e.active <= 0 && e.timer) {
        clearTimeout(e.timer);
        e.timer = null;
      }
    };
  }, [key, enabled, paused]);

  void version;
  const e = key ? entries.get(key) : undefined;
  const refresh = useCallback(() => (key ? run(key, true) : Promise.resolve()), [key]);
  return {
    data: e?.data as T | undefined,
    error: e?.error ?? null,
    loading: e?.loading ?? false,
    updatedAt: e?.updatedAt ?? 0,
    refresh,
  };
}
