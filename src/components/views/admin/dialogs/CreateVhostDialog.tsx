import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { invalidate } from "@/hooks/useLive";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { openOn } from "@/lib/rabbit/nav";
import { paths } from "@/lib/rabbit/paths";
import { useConnectionsStore } from "@/store/connectionsStore";
import type { DialogProps } from "../../types";
import { Field, TagChips } from "../shared";

const QUEUE_TYPES = ["classic", "quorum", "stream"].map((t) => ({ value: t, label: t }));

export default function CreateVhostDialog({ context, onClose }: DialogProps) {
  const cid = context.connectionId;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [type, setType] = useState("classic");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError("Give the virtual host a name.");
    setBusy(true);
    setError(null);
    const api = rabbit(cid);
    // PUT on an existing vhost succeeds silently, so look first.
    const exists = await api.get(paths.vhost(n)).then(
      () => true,
      () => false,
    );
    if (exists) {
      setBusy(false);
      return setError(`A virtual host named ${n} already exists.`);
    }
    try {
      await api.put(paths.vhost(n), { description, tags, default_queue_type: type });
    } catch (err) {
      setBusy(false);
      return setError(errorText(err));
    }
    // A vhost nobody can use is a trap: give the user this connection logs in as full access.
    const user = useConnectionsStore.getState().sessions[cid]?.user;
    let granted = true;
    if (user) {
      try {
        await api.put(paths.permission(n, user), { configure: ".*", write: ".*", read: ".*" });
      } catch (err) {
        granted = false;
        toast.warning(`Created ${n}, but ${user} has no access to it`, { description: errorText(err) });
      }
    }
    invalidate(`${cid}:`);
    if (granted) toast.success("Virtual host created", { description: user ? `${n} · ${user} has full access` : n });
    openOn(cid, { kind: "admin", section: "vhosts", focus: n });
    onClose();
  };

  return (
    <Modal
      title="New virtual host"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="create-vhost" disabled={busy}>
            {busy ? "Creating…" : "Create virtual host"}
          </Button>
        </>
      }
    >
      <form id="create-vhost" className="flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
        <Field label="Name" htmlFor="vh-name">
          <Input id="vh-name" autoFocus className="font-mono" placeholder="billing" value={name} aria-invalid={error ? true : undefined} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="vh-description">
          <Input id="vh-description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Tags">
          <TagChips value={tags} onChange={setTags} suggestions={[]} />
        </Field>
        <Field label="Default queue type" help="Used for queues declared without an x-queue-type. Quorum suits data you cannot lose.">
          <SegmentedControl aria-label="Default queue type" value={type} onChange={setType} options={QUEUE_TYPES} />
        </Field>
        {error && (
          <div role="alert" className="text-sm text-danger">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
