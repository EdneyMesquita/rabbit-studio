import { api, type HttpMethod } from "../tauri";
import { sessionIdFor } from "../../store/connectionsStore";

/** Thrown when a view asks for a connection that isn't connected. */
export class NotConnected extends Error {
  constructor(public connectionId: string) {
    super("Not connected");
  }
}

function sid(connectionId: string): string {
  const id = sessionIdFor(connectionId);
  if (!id) throw new NotConnected(connectionId);
  return id;
}

/**
 * The management API of one saved connection, by connection id: the
 * session id is read at call time, so a reconnect doesn't strand a view.
 */
export function rabbit(connectionId: string) {
  const call = <T>(method: HttpMethod, path: string, body?: unknown) =>
    api.mgmt<T>(sid(connectionId), method, path, body);
  return {
    get: <T>(path: string) => call<T>("GET", path),
    put: <T = void>(path: string, body?: unknown) => call<T>("PUT", path, body ?? {}),
    post: <T = void>(path: string, body?: unknown) => call<T>("POST", path, body ?? {}),
    del: <T = void>(path: string) => call<T>("DELETE", path),
    sessionId: () => sid(connectionId),
  };
}

/** An error's message, as the backend phrased it. */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === "string" ? e : JSON.stringify(e);
}
