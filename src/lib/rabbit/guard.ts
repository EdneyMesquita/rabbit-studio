import { confirm } from "@/store/confirmStore";
import { useConnectionsStore } from "@/store/connectionsStore";

/**
 * Asks before a destructive action on a connection. On a guarded
 * connection (production, or one that asks for it) the button stays off
 * until `guard` - the object's own name: the queue, the vhost, the flag -
 * is typed, as in the mockup; the connection's name when there is no
 * object. Elsewhere it is a plain question. Resolves true to go ahead.
 */
export function confirmDestructive(
  connectionId: string,
  options: { title: string; message: string; confirmLabel: string; guard?: string },
): Promise<boolean> {
  const profile = useConnectionsStore.getState().profiles.find((p) => p.id === connectionId);
  const typed = profile?.typedConfirmation ? (options.guard ?? profile.name) : null;
  const where = profile?.environment === "production" ? "is production" : "is a guarded connection";
  return confirm({
    title: options.title,
    message: options.message,
    confirmLabel: options.confirmLabel,
    danger: true,
    typed,
    typedLabel: typed && profile ? `${profile.name} ${where}. Type` : undefined,
  });
}

/** Whether the connection refuses changes (read-only). */
export function isReadOnly(connectionId: string): boolean {
  return useConnectionsStore.getState().profiles.find((p) => p.id === connectionId)?.readOnly ?? false;
}
