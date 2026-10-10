import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { Field } from "@/components/connections/Field";
import { Notice } from "@/components/data/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { invalidate, useLive } from "@/hooks/useLive";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { isReadOnly } from "@/lib/rabbit/guard";
import { openOn } from "@/lib/rabbit/nav";
import { paths, withQuery } from "@/lib/rabbit/paths";
import type { Overview, VHost } from "@/types/rabbit";
import type { DialogProps } from "../../types";

/** What every broker has, until the overview says which types are enabled. */
const BASIC_TYPES = ["direct", "fanout", "topic", "headers"];

export default function CreateExchangeDialog({ context, onClose }: DialogProps) {
  const cid = context.connectionId;
  const readOnly = isReadOnly(cid);
  const vhosts = useLive<VHost[]>(`${cid}:vhosts:names`, () => rabbit(cid).get<VHost[]>(withQuery(paths.vhosts, { columns: "name" })), {
    interval: 0,
  });
  const overview = useLive<Pick<Overview, "exchange_types">>(
    `${cid}:overview:exchange-types`,
    () => rabbit(cid).get(withQuery(paths.overview, { columns: "exchange_types" })),
    { interval: 0 },
  );
  const names = useMemo(() => (vhosts.data ?? []).map((v) => v.name).sort(), [vhosts.data]);
  const types = useMemo(() => {
    const enabled = overview.data?.exchange_types?.filter((t) => t.enabled).map((t) => t.name);
    return enabled?.length ? enabled : BASIC_TYPES;
  }, [overview.data]);

  const [name, setName] = useState("");
  const [vhostPick, setVhostPick] = useState<string | null>(context.vhost ?? null);
  const vhost = vhostPick ?? (names.includes("/") ? "/" : names[0] ?? "");
  const [type, setType] = useState("topic");
  const [durable, setDurable] = useState(true);
  const [autoDelete, setAutoDelete] = useState(false);
  const [internal, setInternal] = useState(false);
  const [alternate, setAlternate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const exchange = name.trim();
    if (!exchange) return setError("Give the exchange a name.");
    if (!vhost) return setError("Pick a virtual host.");
    if (exchange.startsWith("amq.")) return setError("Names starting with amq. are reserved by the broker.");
    setBusy(true);
    setError(null);
    try {
      // PUT on an existing exchange with the same settings succeeds silently: look first.
      const exists = await rabbit(cid)
        .get(paths.exchange(vhost, exchange))
        .then(() => true)
        .catch(() => false);
      if (exists) {
        setError(`An exchange named ${exchange} already exists in ${vhost}.`);
        setBusy(false);
        return;
      }
      const args = alternate.trim() ? { "alternate-exchange": alternate.trim() } : {};
      await rabbit(cid).put(paths.exchange(vhost, exchange), { type, durable, auto_delete: autoDelete, internal, arguments: args });
      toast.success(`Created exchange ${exchange}`, { description: `${type} · ${vhost}` });
      invalidate(`${cid}:exchanges`);
      openOn(cid, { kind: "exchange", vhost, name: exchange });
      onClose();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New exchange"
      onClose={onClose}
      footer={
        <>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="create-exchange" disabled={busy || readOnly}>
            Create exchange
          </Button>
        </>
      }
    >
      <form id="create-exchange" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {readOnly && <Notice tone="warn">This connection is read-only.</Notice>}
        <Field label="Name" htmlFor="cx-name">
          <Input id="cx-name" className="font-mono" autoFocus autoComplete="off" spellCheck={false} placeholder="billing.events" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Virtual host" htmlFor="cx-vhost">
            <Select value={vhost} onValueChange={setVhostPick}>
              <SelectTrigger id="cx-vhost" className="w-full font-mono">
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
          <Field label="Type" htmlFor="cx-type">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="cx-type" className="w-full font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t} value={t} className="font-mono">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-fg-2">
            <Switch size="sm" checked={durable} onCheckedChange={setDurable} />
            Durable
          </label>
          <label className="flex items-center gap-2 text-sm text-fg-2">
            <Switch size="sm" checked={autoDelete} onCheckedChange={setAutoDelete} />
            Auto-delete
          </label>
          <label className="flex items-center gap-2 text-sm text-fg-2">
            <Switch size="sm" checked={internal} onCheckedChange={setInternal} />
            Internal
          </label>
        </div>
        <Field label="Alternate exchange" htmlFor="cx-alt" help="Receives messages this exchange cannot route. Optional.">
          <Input id="cx-alt" className="font-mono" autoComplete="off" spellCheck={false} placeholder="orders.unrouted" value={alternate} onChange={(e) => setAlternate(e.target.value)} />
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
