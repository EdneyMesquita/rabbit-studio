import { invoke } from "@tauri-apps/api/core";
import type {
  ConnectionHandle,
  ConnectionProfile,
  ConnectionProfileInput,
  ConnectionProfileMeta,
  ConnectionImportPreview,
  ConnectionTestResult,
  ConnectionsExportSummary,
  ConnectionsImportSummary,
  SecretBackendInfo,
} from "../types/connection";
import type { Message, StreamOffset, TransferInput, TransferSummary } from "../types/rabbit";

export type HttpMethod = "GET" | "PUT" | "POST" | "DELETE";

const decoder = new TextDecoder();

/**
 * The management API's answer: Tauri hands the raw body over as an
 * ArrayBuffer (parsed once, here); the dev bridge has parsed it already.
 */
function parseBody<T>(body: unknown): T {
  if (body instanceof ArrayBuffer) {
    if (body.byteLength === 0) return null as T;
    return JSON.parse(decoder.decode(body)) as T;
  }
  if (body instanceof Uint8Array) {
    if (body.byteLength === 0) return null as T;
    return JSON.parse(decoder.decode(body)) as T;
  }
  return body as T;
}

export const api = {
  listConnectionProfiles: () => invoke<ConnectionProfileMeta[]>("list_connection_profiles"),
  getConnectionProfile: (id: string) => invoke<ConnectionProfile>("get_connection_profile", { id }),
  saveConnectionProfile: (input: ConnectionProfileInput) =>
    invoke<ConnectionProfileMeta>("save_connection_profile", { input }),
  deleteConnectionProfile: (id: string) => invoke<void>("delete_connection_profile", { id }),
  testConnection: (input: ConnectionProfileInput) => invoke<ConnectionTestResult>("test_connection", { input }),
  connect: (id: string) => invoke<ConnectionHandle>("connect", { id }),
  disconnect: (sessionId: string) => invoke<void>("disconnect", { sessionId }),
  secretBackendInfo: () => invoke<SecretBackendInfo>("secret_backend_info"),
  /** Opens the app's log folder in the file manager; resolves to its path. */
  openLogDir: () => invoke<string>("open_log_dir"),

  exportConnections: (destPath: string, includeSecrets: boolean) =>
    invoke<ConnectionsExportSummary>("export_connections", { destPath, includeSecrets }),
  previewConnectionsImport: (srcPath: string) =>
    invoke<ConnectionImportPreview[]>("preview_connections_import", { srcPath }),
  /** Imports the connections at `selected` positions of the file. */
  importConnections: (srcPath: string, selected: number[]) =>
    invoke<ConnectionsImportSummary>("import_connections", { srcPath, selected }),
  getSidebarLayout: () => invoke<unknown>("get_sidebar_layout"),
  saveSidebarLayout: (layout: unknown) => invoke<void>("save_sidebar_layout", { layout }),

  /**
   * A management API call. `path` is relative to /api/ and must already be
   * percent-encoded (use the builders in lib/rabbit/paths).
   */
  mgmt: async <T>(sessionId: string, method: HttpMethod, path: string, body?: unknown): Promise<T> =>
    parseBody<T>(await invoke<unknown>("mgmt", { sessionId, methodName: method, path, body: body ?? null })),

  /** Reads `count` messages off the head of a queue; `requeue` puts them back (a peek). */
  getMessages: (sessionId: string, vhost: string, queue: string, count: number, requeue: boolean, truncate?: number) =>
    invoke<Message[]>("get_messages", { sessionId, vhost, queue, count, requeue, truncate: truncate ?? null }),

  /** Moves, replays or deletes messages over AMQP; progress arrives as `transfer-progress` events. */
  transferMessages: (sessionId: string, executionId: string, input: TransferInput) =>
    invoke<TransferSummary>("transfer_messages", { sessionId, executionId, input }),

  readStream: (
    sessionId: string,
    executionId: string,
    vhost: string,
    queue: string,
    offset: StreamOffset,
    count: number,
    truncate?: number,
  ) => invoke<Message[]>("read_stream", { sessionId, executionId, vhost, queue, offset, count, truncate: truncate ?? null }),

  cancelTask: (executionId: string) => invoke<void>("cancel_task", { executionId }),

  exportDefinitions: (sessionId: string, vhost: string | null, destPath: string) =>
    invoke<number>("export_definitions", { sessionId, vhost, destPath }),
  importDefinitions: (sessionId: string, vhost: string | null, srcPath: string) =>
    invoke<void>("import_definitions", { sessionId, vhost, srcPath }),
  readTextFile: (path: string) => invoke<string>("read_text_file", { path }),
  writeTextFile: (path: string, contents: string) => invoke<void>("write_text_file", { path, contents }),
};
