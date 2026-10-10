import { confirm } from "@/store/confirmStore";
import { useConnectionsStore } from "@/store/connectionsStore";

/**
 * Asks before a destructive action on a connection: a typed guard (its
 * name) when it is production or asks for one, a plain question otherwise.
 * Resolves true to go ahead.
 */
export function confirmDestructive(
  connectionId: string,
  options: { title: string; message: string; confirmLabel: string },
): Promise<boolean> {
  const profile = useConnectionsStore.getState().profiles.find((p) => p.id === connectionId);
  const typed = profile?.typedConfirmation ? profile.name : null;
  return confirm({
    ...options,
    danger: true,
    typed,
    typedLabel: typed ? "This is a guarded connection. Type its name," : undefined,
  });
}

/** Whether the connection refuses changes (read-only). */
export function isReadOnly(connectionId: string): boolean {
  return useConnectionsStore.getState().profiles.find((p) => p.id === connectionId)?.readOnly ?? false;
}
