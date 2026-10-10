import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { useLive } from "@/hooks/useLive";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { int } from "@/lib/rabbit/format";
import { isReadOnly } from "@/lib/rabbit/guard";
import { paths } from "@/lib/rabbit/paths";
import type { Queue } from "@/types/rabbit";
import type { DialogProps } from "../../types";
import { refreshQueues } from "../lib/transfer";
import { useGuard } from "./Guard";

/** Purge: every ready message of the queue, gone. */
export default function PurgeQueueDialog({ context, onClose }: DialogProps) {
  const cid = context.connectionId;
  const vhost = context.vhost ?? "/";
  const name = context.name ?? "";
  const q = useLive<Queue>(`${cid}:queue:${vhost}:${name}:dialog`, () => rabbit(cid).get<Queue>(paths.queue(vhost, name)), {
    interval: 0,
  });
  const ready = q.data?.messages_ready ?? null;
  const guard = useGuard(cid, name);
  const [busy, setBusy] = useState(false);
  const readOnly = isReadOnly(cid);
  const stream = q.data?.type === "stream";

  async function purge() {
    if (!guard.ok || busy) return;
    setBusy(true);
    try {
      await rabbit(cid).del(paths.queueContents(vhost, name));
      toast.success("Queue purged", { description: `${ready != null ? int(ready) : "All"} messages removed from ${name}` });
      refreshQueues(cid);
      onClose();
    } catch (e) {
      toast.error("Purge failed", { description: errorText(e) });
      setBusy(false);
    }
  }

  const label = ready != null ? `Purge ${int(ready)} ${ready === 1 ? "message" : "messages"}` : "Purge";
  return (
    <Modal
      danger
      title={`Purge ${name}?`}
      onClose={onClose}
      width="max-w-[460px]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!guard.ok || busy || readOnly || stream} onClick={purge}>
            {busy ? "Purging…" : label}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void purge();
        }}
      >
        <p className="text-base text-fg-2">
          Removes <b className="font-medium text-fg">{ready != null ? int(ready) : "every"}</b> ready messages from{" "}
          <span className="font-mono text-[12.5px] text-fg">
            {vhost}/{name}
          </span>{" "}
          on {guard.profileName}. Unacked messages are not touched. This cannot be undone.
        </p>
        {readOnly && <p className="mt-2 text-sm text-danger">This connection is read-only.</p>}
        {stream && <p className="mt-2 text-sm text-danger">Streams can't be purged; set a retention policy instead.</p>}
        {q.error && <p className="mt-2 text-sm text-danger">{q.error}</p>}
        {guard.field}
      </form>
    </Modal>
  );
}
