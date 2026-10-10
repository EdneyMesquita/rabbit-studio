import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/Modal";
import { useLive } from "@/hooks/useLive";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { int } from "@/lib/rabbit/format";
import { isReadOnly } from "@/lib/rabbit/guard";
import { tabConnection } from "@/lib/rabbit/nav";
import { paths, withQuery } from "@/lib/rabbit/paths";
import { tabKey, useSessionsStore } from "@/store/sessionsStore";
import type { Binding, Queue } from "@/types/rabbit";
import type { DialogProps } from "../../types";
import { refreshQueues } from "../lib/transfer";
import { useGuard } from "./Guard";

/** Delete a queue, optionally only when empty or unused; its tab closes. */
export default function DeleteQueueDialog({ context, onClose }: DialogProps) {
  const cid = context.connectionId;
  const vhost = context.vhost ?? "/";
  const name = context.name ?? "";
  const info = useLive<{ q: Queue; bindings: number }>(
    `${cid}:queue:${vhost}:${name}:delete-dialog`,
    async () => {
      const api = rabbit(cid);
      const [q, b] = await Promise.all([
        api.get<Queue>(paths.queue(vhost, name)),
        api.get<Binding[]>(paths.queueBindings(vhost, name)),
      ]);
      return { q, bindings: b.length };
    },
    { interval: 0 },
  );
  const q = info.data?.q;
  const guard = useGuard(cid, name);
  const [ifEmpty, setIfEmpty] = useState(false);
  const [ifUnused, setIfUnused] = useState(false);
  const [busy, setBusy] = useState(false);
  const readOnly = isReadOnly(cid);

  async function remove() {
    if (!guard.ok || busy) return;
    setBusy(true);
    try {
      await rabbit(cid).del(
        withQuery(paths.queue(vhost, name), { "if-empty": ifEmpty || undefined, "if-unused": ifUnused || undefined }),
      );
      toast.success("Queue deleted", { description: name });
      const id =
        (context.data?.tabId as string | undefined) ??
        tabKey({ kind: "queue", connection: tabConnection(cid), vhost, name });
      const sessions = useSessionsStore.getState();
      if (sessions.tabs.some((t) => t.id === id)) sessions.closeTab(id);
      refreshQueues(cid);
      onClose();
    } catch (e) {
      toast.error("Delete failed", { description: errorText(e) });
      setBusy(false);
    }
  }

  const total = q?.messages ?? null;
  const consumers = q?.consumers ?? 0;
  return (
    <Modal
      title={`Delete ${name}?`}
      onClose={onClose}
      width="max-w-[460px]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!guard.ok || busy || readOnly} onClick={remove}>
            {busy ? "Deleting…" : "Delete queue"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void remove();
        }}
      >
        <p className="text-base text-fg-2">
          The queue <span className="font-mono text-[12.5px] text-fg">{vhost}/{name}</span> on {guard.profileName}, its{" "}
          <b className="font-medium text-fg">{total != null ? int(total) : "…"}</b> messages and{" "}
          {info.data ? int(info.data.bindings) : "…"} bindings are removed.
          {consumers > 0 && (
            <>
              {" "}
              <b className="font-medium text-fg">{consumers} consumers</b> get basic.cancel.
            </>
          )}
        </p>
        <div className="mt-3 flex flex-col gap-2 text-base text-fg">
          <label className="flex items-center gap-2">
            <Checkbox checked={ifEmpty} onCheckedChange={(v) => setIfEmpty(v === true)} />
            Only if empty
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={ifUnused} onCheckedChange={(v) => setIfUnused(v === true)} />
            Only if it has no consumers
          </label>
        </div>
        {readOnly && <p className="mt-2 text-sm text-danger">This connection is read-only.</p>}
        {info.error && <p className="mt-2 text-sm text-danger">{info.error}</p>}
        {guard.field}
      </form>
    </Modal>
  );
}
