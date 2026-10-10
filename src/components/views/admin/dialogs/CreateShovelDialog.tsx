import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { invalidate } from "@/hooks/useLive";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { openOn } from "@/lib/rabbit/nav";
import { paths } from "@/lib/rabbit/paths";
import type { Parameter } from "@/types/rabbit";
import type { DialogProps } from "../../types";
import { uriList } from "../adminLogic";
import { Field, FieldRow, useVhostNames } from "../shared";

type Kind = "queue" | "exchange";
type DeleteAfter = "never" | "queue-length" | "count";

const ACK_MODES = ["on-confirm", "on-publish", "no-ack"];
const KINDS: { value: Kind; label: string }[] = [
  { value: "queue", label: "Queue" },
  { value: "exchange", label: "Exchange" },
];

/** One end of the shovel: its URI and the queue or exchange it reads from or writes to. */
interface End {
  uri: string;
  kind: Kind;
  queue: string;
  exchange: string;
  key: string;
}

function endOf(v: Record<string, unknown>, side: "src" | "dest"): End {
  return {
    uri: uriList(v[`${side}-uri`]).join(", ") || "amqp://",
    kind: v[`${side}-exchange`] ? "exchange" : "queue",
    queue: String(v[`${side}-queue`] ?? ""),
    exchange: String(v[`${side}-exchange`] ?? ""),
    key: String(v[`${side}-exchange-key`] ?? v[`${side}-routing-key`] ?? ""),
  };
}

function EndFields({ id, title, end, onChange, source }: { id: string; title: string; end: End; onChange: (e: End) => void; source: boolean }) {
  const set = (patch: Partial<End>) => onChange({ ...end, ...patch });
  return (
    <fieldset className="flex flex-col gap-2 rounded-md border border-line p-3">
      <legend className="px-1 text-xs font-semibold tracking-[0.02em] text-fg-2 uppercase">{title}</legend>
      <Field label="URI" htmlFor={`${id}-uri`} help={'"amqp://" alone is this broker, on the shovel\'s own vhost.'}>
        <Input id={`${id}-uri`} spellCheck={false} className="font-mono text-[12px]" value={end.uri} onChange={(e) => set({ uri: e.target.value })} />
      </Field>
      <SegmentedControl<Kind> aria-label={`${title} kind`} value={end.kind} onChange={(kind) => set({ kind })} options={KINDS} />
      {end.kind === "queue" ? (
        <Field label="Queue" htmlFor={`${id}-queue`} help={source ? undefined : "Leave empty to keep each message's own routing key."}>
          <Input id={`${id}-queue`} className="font-mono" value={end.queue} onChange={(e) => set({ queue: e.target.value })} />
        </Field>
      ) : (
        <FieldRow>
          <Field label="Exchange" htmlFor={`${id}-exchange`}>
            <Input id={`${id}-exchange`} className="font-mono" value={end.exchange} onChange={(e) => set({ exchange: e.target.value })} />
          </Field>
          <Field label="Routing key" htmlFor={`${id}-key`} help={source ? "Binding key for the shovel's own queue." : "Leave empty to keep each message's."}>
            <Input id={`${id}-key`} className="font-mono" value={end.key} onChange={(e) => set({ key: e.target.value })} />
          </Field>
        </FieldRow>
      )}
    </fieldset>
  );
}

export default function CreateShovelDialog({ context, onClose }: DialogProps) {
  const cid = context.connectionId;
  const editing = (context.data?.shovel as Parameter | undefined) ?? null;
  const value = (editing?.value ?? {}) as Record<string, unknown>;
  const vhostNames = useVhostNames(cid);

  const [name, setName] = useState(editing?.name ?? "");
  const [vhostPick, setVhost] = useState(editing?.vhost ?? context.vhost ?? "");
  const vhost = vhostPick || (vhostNames.includes("/") ? "/" : (vhostNames[0] ?? ""));
  const [src, setSrc] = useState<End>(() => endOf(value, "src"));
  const [dest, setDest] = useState<End>(() => endOf(value, "dest"));
  const [prefetch, setPrefetch] = useState(value["src-prefetch-count"] == null ? "1000" : String(value["src-prefetch-count"]));
  const [ack, setAck] = useState(String(value["ack-mode"] ?? "on-confirm"));
  const rawAfter = value["src-delete-after"];
  const [after, setAfter] = useState<DeleteAfter>(typeof rawAfter === "number" ? "count" : rawAfter === "queue-length" ? "queue-length" : "never");
  const [count, setCount] = useState(typeof rawAfter === "number" ? String(rawAfter) : "");
  const [forward, setForward] = useState(value["dest-add-forward-headers"] === true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError("Give the shovel a name.");
    if (!vhost) return setError("Choose a virtual host.");
    if (!src.uri.trim() || !dest.uri.trim()) return setError("Both ends need a URI.");
    if (src.kind === "queue" ? !src.queue.trim() : !src.exchange.trim()) return setError(`Name the source ${src.kind}.`);
    if (dest.kind === "exchange" && !dest.exchange.trim()) return setError("Name the destination exchange, or switch it to a queue.");
    if (!/^\d+$/.test(prefetch.trim())) return setError("Prefetch is a whole number.");
    if (after === "count" && !/^\d+$/.test(count.trim())) return setError("Delete after needs a whole number of messages.");

    if (ack === "no-ack" && after === "count") return setError("The broker refuses no-ack with a numeric delete-after. Use on-confirm or on-publish.");

    const body: Record<string, unknown> = { ...value };
    for (const k of ["src-queue", "src-exchange", "src-exchange-key", "dest-queue", "dest-exchange", "dest-exchange-key"]) delete body[k];
    body["src-protocol"] ??= "amqp091";
    body["dest-protocol"] ??= "amqp091";
    body["src-uri"] = src.uri.trim();
    body["dest-uri"] = dest.uri.trim();
    if (src.kind === "queue") body["src-queue"] = src.queue.trim();
    else {
      body["src-exchange"] = src.exchange.trim();
      if (src.key.trim()) body["src-exchange-key"] = src.key.trim();
    }
    if (dest.kind === "queue") {
      if (dest.queue.trim()) body["dest-queue"] = dest.queue.trim();
    } else {
      body["dest-exchange"] = dest.exchange.trim();
      if (dest.key.trim()) body["dest-exchange-key"] = dest.key.trim();
    }
    body["src-prefetch-count"] = Number(prefetch);
    body["ack-mode"] = ack;
    body["src-delete-after"] = after === "count" ? Number(count) : after;
    body["dest-add-forward-headers"] = forward;

    setBusy(true);
    setError(null);
    const api = rabbit(cid);
    if (!editing) {
      // PUT on an existing shovel replaces it, so look first.
      const exists = await api.get(paths.parameter("shovel", vhost, n)).then(
        () => true,
        () => false,
      );
      if (exists) {
        setBusy(false);
        return setError(`A shovel named ${n} already exists in ${vhost}.`);
      }
    }
    try {
      await api.put(paths.parameter("shovel", vhost, n), { value: body });
    } catch (err) {
      setBusy(false);
      return setError(errorText(err));
    }
    invalidate(`${cid}:`);
    toast.success(editing ? "Shovel updated" : "Shovel created", { description: `${n} on ${vhost}` });
    if (!editing) openOn(cid, { kind: "admin", section: "shovels", focus: n });
    onClose();
  };

  return (
    <Modal
      title={editing ? "Edit shovel" : "New shovel"}
      onClose={onClose}
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="create-shovel" disabled={busy}>
            {busy ? "Saving…" : editing ? "Save shovel" : "Create shovel"}
          </Button>
        </>
      }
    >
      <form id="create-shovel" className="flex flex-col gap-3" onSubmit={(e) => void submit(e)} autoComplete="off">
        <FieldRow>
          <Field label="Name" htmlFor="sh-name">
            <Input id="sh-name" autoFocus={!editing} disabled={!!editing} className="font-mono" placeholder="orders-archive" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Virtual host">
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
        <EndFields id="sh-src" title="Source" end={src} onChange={setSrc} source />
        <EndFields id="sh-dest" title="Destination" end={dest} onChange={setDest} source={false} />
        <FieldRow>
          <Field label="Prefetch count" htmlFor="sh-prefetch">
            <Input id="sh-prefetch" inputMode="numeric" className="font-mono" value={prefetch} onChange={(e) => setPrefetch(e.target.value)} />
          </Field>
          <Field label="Acknowledgement mode">
            <Select value={ack} onValueChange={setAck}>
              <SelectTrigger className="w-full font-mono text-[12px]" aria-label="Acknowledgement mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACK_MODES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Delete after" help="When the shovel removes itself.">
            <Select value={after} onValueChange={(v) => setAfter(v as DeleteAfter)}>
              <SelectTrigger className="w-full font-mono text-[12px]" aria-label="Delete after">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">never</SelectItem>
                <SelectItem value="queue-length">queue-length (what is there now)</SelectItem>
                <SelectItem value="count">after N messages</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {after === "count" ? (
            <Field label="Messages" htmlFor="sh-count">
              <Input id="sh-count" inputMode="numeric" className="font-mono" value={count} onChange={(e) => setCount(e.target.value)} />
            </Field>
          ) : (
            <span />
          )}
        </FieldRow>
        <label className="flex items-center gap-2 text-sm text-fg">
          <Switch checked={forward} onCheckedChange={setForward} />
          Add forward headers
          <span className="text-xs text-fg-3">x-shovelled records where each message came from</span>
        </label>
        {error && (
          <div role="alert" className="text-sm text-danger">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
