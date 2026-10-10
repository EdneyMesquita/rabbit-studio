import { useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/data/parts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/Modal";
import { invalidate } from "@/hooks/useLive";
import { useConnectionsStore } from "@/store/connectionsStore";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { confirmDestructive, isReadOnly } from "@/lib/rabbit/guard";
import { paths, withQuery } from "@/lib/rabbit/paths";
import { useSessionsStore } from "@/store/sessionsStore";
import type { DialogProps } from "../../types";

/** Deletes an exchange, optionally only if nothing is bound to it. */
export default function DeleteExchangeDialog({ context, onClose }: DialogProps) {
  const { connectionId } = context;
  const vhost = context.vhost ?? "/";
  const name = context.name ?? "";
  const readOnly = isReadOnly(connectionId);
  const guarded = useConnectionsStore((s) => {
    const p = s.profiles.find((x) => x.id === connectionId);
    return !!p && (p.typedConfirmation || p.environment === "production");
  });
  const system = name === "" || name.startsWith("amq.");
  const [ifUnused, setIfUnused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setError(null);
    // This dialog is the question; only a guarded connection asks again, for the exchange's name.
    if (guarded) {
      const ok = await confirmDestructive(connectionId, {
        title: "Delete exchange",
        guard: name,
        message: `Delete exchange ${name} in ${vhost}? Its bindings go with it and messages published to it are dropped.`,
        confirmLabel: "Delete",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await rabbit(connectionId).del(withQuery(paths.exchange(vhost, name), { "if-unused": ifUnused ? true : undefined }));
      toast.success(`Deleted exchange ${name}`);
      const sessions = useSessionsStore.getState();
      for (const t of sessions.tabs)
        if (t.kind === "exchange" && t.connection?.id === connectionId && t.vhost === vhost && t.name === name) sessions.closeTab(t.id);
      for (const k of ["exchange", "exchanges", "topology", "publish-routing"]) invalidate(`${connectionId}:${k}`);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      danger
      title="Delete exchange"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={readOnly || system || busy} onClick={() => void remove()}>
            Delete exchange
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-fg-2">
        {readOnly && <Notice tone="info">This connection is <b>read-only</b>.</Notice>}
        {system && <Notice tone="warn">The default and <b>amq.*</b> exchanges are built in and cannot be deleted.</Notice>}
        <p>
          Delete <b className="font-mono font-medium text-fg">{name || "(default)"}</b> in <span className="font-mono">{vhost}</span>. Its bindings are removed and
          messages published to it are dropped.
        </p>
        <label className="flex items-center gap-2">
          <Checkbox checked={ifUnused} onCheckedChange={(v) => setIfUnused(v === true)} />
          Only if unused (nothing bound from it), otherwise the broker refuses
        </label>
        {error && (
          <div role="alert" className="text-danger">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
