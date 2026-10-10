import { useState } from "react";
import { ConnectionChip } from "@/components/ui/ConnectionChip";
import { Input } from "@/components/ui/input";
import { connectionColor } from "@/lib/connectionColor";
import { useConnectionsStore } from "@/store/connectionsStore";

/**
 * The typed guard inside a destructive dialog (DESIGN.md: confirm dialog):
 * on a guarded connection the object's name must be typed before the
 * danger button turns on. Done in the dialog itself, not a second modal.
 */
export function useGuard(cid: string, objectName: string) {
  const profile = useConnectionsStore((s) => s.profiles.find((p) => p.id === cid));
  const guarded = profile?.typedConfirmation ?? false;
  const [typed, setTyped] = useState("");
  const ok = !guarded || typed === objectName;
  const field = guarded ? (
    <div className="mt-3 rounded-md bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] p-2.5">
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-fg-2">
        <ConnectionChip name={profile!.name} color={connectionColor(profile!.id, profile!.color)} />
        <b className="font-medium text-fg">{profile!.name}</b> is guarded. Type
        <b className="font-mono text-[12px] font-medium text-fg">{objectName}</b> to confirm.
      </div>
      <Input
        autoFocus
        autoComplete="off"
        spellCheck={false}
        className="font-mono"
        aria-label={`Type ${objectName} to confirm`}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
    </div>
  ) : null;
  return { guarded, ok, field, profileName: profile?.name ?? "this connection" };
}
