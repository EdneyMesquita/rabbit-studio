import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/connections/Field";
import { Notice } from "@/components/data/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { invalidate, useLive } from "@/hooks/useLive";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { isReadOnly } from "@/lib/rabbit/guard";
import { openOn } from "@/lib/rabbit/nav";
import { paths, withQuery } from "@/lib/rabbit/paths";
import type { QueueType, VHost } from "@/types/rabbit";
import type { DialogProps } from "../../types";

type ArgKind = "number" | "string" | "boolean";

interface Preset {
  key: string;
  label: string;
  kind: ArgKind;
  types: QueueType[];
  hint: string;
  /** Allowed values, for a closed set. */
  options?: string[];
}

/** The x-* arguments people actually set, and the queue types that take them. */
const PRESETS: Preset[] = [
  { key: "x-message-ttl", label: "Message TTL", kind: "number", types: ["classic", "quorum"], hint: "milliseconds" },
  { key: "x-expires", label: "Queue expiry", kind: "number", types: ["classic"], hint: "milliseconds idle before it is deleted" },
  { key: "x-max-length", label: "Max length", kind: "number", types: ["classic", "quorum", "stream"], hint: "messages" },
  { key: "x-max-length-bytes", label: "Max length (bytes)", kind: "number", types: ["classic", "quorum", "stream"], hint: "bytes" },
  { key: "x-overflow", label: "Overflow", kind: "string", types: ["classic", "quorum"], hint: "what to do when full", options: ["drop-head", "reject-publish", "reject-publish-dlx"] },
  { key: "x-dead-letter-exchange", label: "Dead-letter exchange", kind: "string", types: ["classic", "quorum"], hint: "exchange name" },
  { key: "x-dead-letter-routing-key", label: "Dead-letter routing key", kind: "string", types: ["classic", "quorum"], hint: "optional" },
  { key: "x-single-active-consumer", label: "Single active consumer", kind: "boolean", types: ["classic", "quorum"], hint: "one consumer at a time" },
  { key: "x-delivery-limit", label: "Delivery limit", kind: "number", types: ["quorum"], hint: "redeliveries before dead-lettering" },
  { key: "x-max-age", label: "Max age", kind: "string", types: ["stream"], hint: "e.g. 7D, 12h, 30m" },
  { key: "x-initial-cluster-size", label: "Initial cluster size", kind: "number", types: ["quorum", "stream"], hint: "replicas" },
];

interface ArgRow {
  id: number;
  key: string;
  value: string;
}

let rowId = 0;

/** A custom argument's value: numbers and booleans as such, the rest text. */
function coerce(value: string): string | number | boolean {
  const v = value.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (v !== "" && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return value;
}

function argValue(row: ArgRow): { ok: true; value: unknown } | { ok: false; error: string } {
  const preset = PRESETS.find((p) => p.key === row.key);
  const v = row.value.trim();
  if (!preset) return { ok: true, value: coerce(row.value) };
  if (preset.kind === "boolean") return { ok: true, value: v !== "false" };
  if (preset.kind === "number") {
    return /^\d+$/.test(v) ? { ok: true, value: Number(v) } : { ok: false, error: `${row.key} takes a whole number` };
  }
  return v ? { ok: true, value: v } : { ok: false, error: `${row.key} needs a value` };
}

export default function CreateQueueDialog({ context, onClose }: DialogProps) {
  const cid = context.connectionId;
  const readOnly = isReadOnly(cid);
  const vhosts = useLive<VHost[]>(`${cid}:vhosts:names`, () => rabbit(cid).get<VHost[]>(withQuery(paths.vhosts, { columns: "name" })), {
    interval: 0,
  });
  const names = useMemo(() => (vhosts.data ?? []).map((v) => v.name).sort(), [vhosts.data]);

  const [name, setName] = useState("");
  const [vhostPick, setVhostPick] = useState<string | null>(context.vhost ?? null);
  const vhost = vhostPick ?? (names.includes("/") ? "/" : names[0] ?? "");
  const initialType = (context.data?.type as QueueType | undefined) ?? "quorum";
  const [type, setType] = useState<QueueType>(initialType);
  const [durable, setDurable] = useState(true);
  const [autoDelete, setAutoDelete] = useState(false);
  const [rows, setRows] = useState<ArgRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Quorum queues and streams are always durable and never auto-delete.
  const classic = type === "classic";
  const available = PRESETS.filter((p) => p.types.includes(type) && !rows.some((r) => r.key === p.key));

  const update = (id: number, patch: Partial<ArgRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addPreset = (key: string) => {
    const p = PRESETS.find((x) => x.key === key);
    setRows((rs) => [...rs, { id: ++rowId, key, value: p?.kind === "boolean" ? "true" : (p?.options?.[0] ?? "") }]);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const queue = name.trim();
    if (!queue) return setError("Give the queue a name.");
    if (!vhost) return setError("Pick a virtual host.");
    if (queue.startsWith("amq.")) return setError("Names starting with amq. are reserved by the broker.");
    const args: Record<string, unknown> = {};
    for (const row of rows) {
      const key = row.key.trim();
      if (!key) continue;
      const parsed = argValue(row);
      if (!parsed.ok) return setError(parsed.error);
      args[key] = parsed.value;
    }
    setBusy(true);
    setError(null);
    try {
      // PUT on an existing queue with the same settings succeeds silently: look first.
      const exists = await rabbit(cid)
        .get(paths.queue(vhost, queue))
        .then(() => true)
        .catch(() => false);
      if (exists) {
        setError(`A queue named ${queue} already exists in ${vhost}.`);
        setBusy(false);
        return;
      }
      await rabbit(cid).put(paths.queue(vhost, queue), {
        durable: classic ? durable : true,
        auto_delete: classic ? autoDelete : false,
        arguments: { "x-queue-type": type, ...args },
      });
      toast.success(`Created ${type === "stream" ? "stream" : "queue"} ${queue}`, { description: vhost });
      invalidate(`${cid}:queues`);
      invalidate(`${cid}:overview`);
      openOn(cid, { kind: "queue", vhost, name: queue });
      onClose();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={type === "stream" ? "New stream" : "New queue"}
      onClose={onClose}
      width="max-w-xl"
      footer={
        <>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="create-queue" disabled={busy || readOnly}>
            Create {type === "stream" ? "stream" : "queue"}
          </Button>
        </>
      }
    >
      <form id="create-queue" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {readOnly && <Notice tone="warn">This connection is read-only.</Notice>}
        <div className="grid grid-cols-[1fr_180px] gap-3">
          <Field label="Name" htmlFor="cq-name">
            <Input id="cq-name" className="font-mono" autoFocus autoComplete="off" spellCheck={false} placeholder="billing.invoices" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Virtual host" htmlFor="cq-vhost">
            <Select value={vhost} onValueChange={setVhostPick}>
              <SelectTrigger id="cq-vhost" className="w-full font-mono">
                <SelectValue placeholder="Virtual host" />
              </SelectTrigger>
              <SelectContent>
                {names.map((v) => (
                  <SelectItem key={v} value={v} className="font-mono">
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Type" help={type === "quorum" ? "Quorum is the right default for data you cannot lose." : type === "stream" ? "A stream is an append-only log: consumers read it, they don't remove messages." : "Classic queues are the lightest, and the only ones that can be transient or exclusive."}>
          <SegmentedControl<QueueType>
            aria-label="Queue type"
            value={type}
            onChange={(t) => {
              setType(t);
              // Arguments the new type can't take would be refused by the broker.
              setRows((rs) => rs.filter((r) => PRESETS.find((p) => p.key === r.key)?.types.includes(t) ?? true));
            }}
            options={[
              { value: "quorum", label: "quorum" },
              { value: "classic", label: "classic" },
              { value: "stream", label: "stream" },
            ]}
          />
        </Field>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-fg-2">
            <Switch size="sm" checked={classic ? durable : true} disabled={!classic} onCheckedChange={setDurable} />
            Durable
          </label>
          <label className="flex items-center gap-2 text-sm text-fg-2">
            <Switch size="sm" checked={classic ? autoDelete : false} disabled={!classic} onCheckedChange={setAutoDelete} />
            Auto-delete
          </label>
        </div>

        <Field label="Arguments">
          <div className="flex flex-col gap-1.5">
            {rows.map((row) => {
              const preset = PRESETS.find((p) => p.key === row.key);
              return (
                <div key={row.id} className="grid grid-cols-[1fr_1fr_28px] items-center gap-1.5">
                  <Input
                    className="h-7 font-mono text-[12px]"
                    aria-label="Argument name"
                    placeholder="x-argument"
                    spellCheck={false}
                    value={row.key}
                    readOnly={!!preset}
                    title={preset?.label}
                    onChange={(e) => update(row.id, { key: e.target.value })}
                  />
                  {preset?.kind === "boolean" ? (
                    <Select value={row.value} onValueChange={(v) => update(row.id, { value: v })}>
                      <SelectTrigger size="sm" className="w-full font-mono" aria-label={`${row.key} value`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">true</SelectItem>
                        <SelectItem value="false">false</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : preset?.options ? (
                    <Select value={row.value} onValueChange={(v) => update(row.id, { value: v })}>
                      <SelectTrigger size="sm" className="w-full font-mono" aria-label={`${row.key} value`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {preset.options.map((o) => (
                          <SelectItem key={o} value={o} className="font-mono">
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      className="h-7 font-mono text-[12px]"
                      aria-label={`${row.key || "Argument"} value`}
                      placeholder={preset?.hint ?? "value"}
                      spellCheck={false}
                      inputMode={preset?.kind === "number" ? "numeric" : undefined}
                      value={row.value}
                      onChange={(e) => update(row.id, { value: e.target.value })}
                    />
                  )}
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${row.key || "argument"}`} onClick={() => setRows((rs) => rs.filter((r) => r.id !== row.id))}>
                    <X />
                  </Button>
                </div>
              );
            })}
            <div className="flex items-center gap-1.5">
              <Select value="" onValueChange={addPreset}>
                <SelectTrigger size="sm" className="w-56" aria-label="Add a common argument">
                  <Plus className="size-3.5" />
                  <SelectValue placeholder="Add a common argument" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label} <span className="font-mono text-xs text-fg-3">{p.key}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, { id: ++rowId, key: "", value: "" }])}>
                Custom
              </Button>
            </div>
          </div>
        </Field>
        {error && (
          <p role="alert" className="m-0 text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
