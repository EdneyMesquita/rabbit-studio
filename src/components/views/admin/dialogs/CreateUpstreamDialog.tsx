import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { invalidate } from "@/hooks/useLive";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { openOn } from "@/lib/rabbit/nav";
import { paths } from "@/lib/rabbit/paths";
import type { Parameter } from "@/types/rabbit";
import type { DialogProps } from "../../types";
import { splitList, uriList } from "../adminLogic";
import { Field, FieldRow, useVhostNames } from "../shared";

const ACK_MODES = [
  { value: "on-confirm", label: "on-confirm (safest)" },
  { value: "on-publish", label: "on-publish" },
  { value: "no-ack", label: "no-ack (fastest)" },
];

/** The numeric settings, by form field. */
const NUMBERS = [
  { key: "prefetch-count", label: "Prefetch count", help: "Messages in flight (default 1000)." },
  { key: "reconnect-delay", label: "Reconnect delay (s)", help: "Wait before reconnecting (default 5)." },
  { key: "max-hops", label: "Max hops", help: "How far a message may travel (default 1)." },
  { key: "expires", label: "Expires (ms)", help: "Delete the upstream queue after this idle time." },
  { key: "message-ttl", label: "Message TTL (ms)", help: "TTL of messages in the upstream queue." },
] as const;

export default function CreateUpstreamDialog({ context, onClose }: DialogProps) {
  const cid = context.connectionId;
  const editing = (context.data?.upstream as Parameter | undefined) ?? null;
  const value = (editing?.value ?? {}) as Record<string, unknown>;
  const vhostNames = useVhostNames(cid);

  const [name, setName] = useState(editing?.name ?? "");
  const [vhostPick, setVhost] = useState(editing?.vhost ?? context.vhost ?? "");
  const vhost = vhostPick || (vhostNames.includes("/") ? "/" : (vhostNames[0] ?? ""));
  const [uris, setUris] = useState(uriList(value.uri).join("\n"));
  const [numbers, setNumbers] = useState<Record<string, string>>(() =>
    Object.fromEntries(NUMBERS.map((n) => [n.key, value[n.key] == null ? "" : String(value[n.key])])),
  );
  const [ack, setAck] = useState(String(value["ack-mode"] ?? "on-confirm"));
  const [trust, setTrust] = useState(value["trust-user-id"] === true);
  const [exchange, setExchange] = useState(String(value.exchange ?? ""));
  const [queue, setQueue] = useState(String(value.queue ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError("Give the upstream a name.");
    if (!vhost) return setError("Choose a virtual host.");
    const list = splitList(uris);
    if (list.length === 0) return setError("Give at least one URI, e.g. amqps://user:password@host:5671/vhost.");
    const body: Record<string, unknown> = { ...value, uri: list.length === 1 ? list[0] : list, "ack-mode": ack, "trust-user-id": trust };
    for (const f of NUMBERS) {
      const t = numbers[f.key].trim();
      if (t === "") delete body[f.key];
      else if (!/^\d+$/.test(t)) return setError(`${f.label} is a whole number.`);
      else body[f.key] = Number(t);
    }
    for (const [k, v] of [["exchange", exchange], ["queue", queue]] as const) {
      if (v.trim()) body[k] = v.trim();
      else delete body[k];
    }
    setBusy(true);
    setError(null);
    const api = rabbit(cid);
    if (!editing) {
      // PUT on an existing upstream replaces it, so look first.
      const exists = await api.get(paths.parameter("federation-upstream", vhost, n)).then(
        () => true,
        () => false,
      );
      if (exists) {
        setBusy(false);
        return setError(`An upstream named ${n} already exists in ${vhost}.`);
      }
    }
    try {
      await api.put(paths.parameter("federation-upstream", vhost, n), { value: body });
    } catch (err) {
      setBusy(false);
      return setError(errorText(err));
    }
    invalidate(`${cid}:`);
    toast.success(editing ? "Upstream updated" : "Upstream added", { description: `${n} on ${vhost}` });
    if (!editing) openOn(cid, { kind: "admin", section: "federation", focus: n });
    onClose();
  };

  return (
    <Modal
      title={editing ? "Edit upstream" : "New upstream"}
      onClose={onClose}
      width="max-w-lg"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="create-upstream" disabled={busy}>
            {busy ? "Saving…" : editing ? "Save upstream" : "Add upstream"}
          </Button>
        </>
      }
    >
      <form id="create-upstream" className="flex flex-col gap-3" onSubmit={(e) => void submit(e)} autoComplete="off">
        <FieldRow>
          <Field label="Name" htmlFor="up-name">
            <Input id="up-name" autoFocus={!editing} disabled={!!editing} className="font-mono" placeholder="dc-west" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Virtual host" help="Where the upstream is defined: the local vhost.">
            <Select value={vhost} onValueChange={setVhost} disabled={!!editing}>
              <SelectTrigger className="w-full font-mono text-[12px]" aria-label="Virtual host">
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                {(vhostNames.length ? vhostNames : vhost ? [vhost] : []).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldRow>
        <Field label="URI" htmlFor="up-uri" help="One per line; the first that connects is used. Credentials are stored with the upstream.">
          <Textarea id="up-uri" rows={2} spellCheck={false} className="font-mono text-[12px]" placeholder="amqps://federation:secret@host:5671/vhost" value={uris} onChange={(e) => setUris(e.target.value)} />
        </Field>
        <FieldRow>
          <Field label="Acknowledgement mode">
            <Select value={ack} onValueChange={setAck}>
              <SelectTrigger className="w-full font-mono text-[12px]" aria-label="Acknowledgement mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACK_MODES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Trust user-id" help="Keep the user-id of federated messages.">
            <label className="flex h-8 items-center gap-2 text-sm text-fg">
              <Switch checked={trust} onCheckedChange={setTrust} />
              {trust ? "Yes" : "No"}
            </label>
          </Field>
        </FieldRow>
        <div className="grid grid-cols-2 gap-3">
          {NUMBERS.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`up-${f.key}`} help={f.help}>
              <Input id={`up-${f.key}`} inputMode="numeric" className="font-mono" value={numbers[f.key]} onChange={(e) => setNumbers((p) => ({ ...p, [f.key]: e.target.value }))} />
            </Field>
          ))}
        </div>
        <FieldRow>
          <Field label="Exchange" htmlFor="up-exchange" help="Upstream exchange, when not the federated one's name.">
            <Input id="up-exchange" className="font-mono" value={exchange} onChange={(e) => setExchange(e.target.value)} />
          </Field>
          <Field label="Queue" htmlFor="up-queue" help="Upstream queue, for queue federation.">
            <Input id="up-queue" className="font-mono" value={queue} onChange={(e) => setQueue(e.target.value)} />
          </Field>
        </FieldRow>
        {error && (
          <div role="alert" className="text-sm text-danger">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
