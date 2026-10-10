import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Notice } from "@/components/data/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { invalidate, useLive } from "@/hooks/useLive";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { isReadOnly } from "@/lib/rabbit/guard";
import { paths, withQuery } from "@/lib/rabbit/paths";
import type { Exchange } from "@/types/rabbit";
import { topicMatch } from "../../publish/routing";
import type { DialogProps } from "../../types";

type ArgType = "string" | "number" | "boolean";
interface ArgRow {
  id: number;
  key: string;
  value: string;
  type: ArgType;
}
let rowId = 0;

const X_MATCH = ["all", "any", "all-with-x", "any-with-x"];
const field = "h-7 px-2 font-mono text-[12.5px]";
const nativeSelect =
  "h-7 min-w-0 rounded-sm border border-field-line bg-field px-1.5 text-[12.5px] text-fg outline-none focus:border-accent";

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-fg-2">{label}</label>
      {children}
      {hint && <div className="text-xs text-fg-3">{hint}</div>}
    </div>
  );
}

/** Binds a source exchange to a queue or another exchange. */
export default function CreateBindingDialog({ context, onClose }: DialogProps) {
  const { connectionId } = context;
  const data = context.data ?? {};
  const readOnly = isReadOnly(connectionId);
  const [vhost, setVhost] = useState(context.vhost ?? "");
  const [source, setSource] = useState((data.source as string | undefined) ?? "");
  const [destType, setDestType] = useState<"queue" | "exchange">((data.destinationType as "queue" | "exchange" | undefined) ?? "queue");
  const [dest, setDest] = useState((data.destination as string | undefined) ?? "");
  const [rk, setRk] = useState("");
  const [tryKey, setTryKey] = useState("");
  const [xMatch, setXMatch] = useState("all");
  const [rows, setRows] = useState<ArgRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vhosts = useLive<{ name: string }[]>(
    context.vhost == null ? `${connectionId}:binding-vhosts` : null,
    () => rabbit(connectionId).get(withQuery(paths.vhosts, { columns: "name" })),
    { interval: 0 },
  );
  const exchanges = useLive<Pick<Exchange, "name" | "type">[]>(
    vhost ? `${connectionId}:binding-exchanges:${vhost}` : null,
    () => rabbit(connectionId).get(withQuery(paths.exchanges(vhost), { columns: "name,type" })),
    { interval: 0 },
  );
  const queues = useLive<{ name: string }[]>(
    vhost ? `${connectionId}:binding-queues:${vhost}` : null,
    () => rabbit(connectionId).get(withQuery(paths.queues(vhost), { columns: "name" })),
    { interval: 0 },
  );

  const sources = useMemo(() => (exchanges.data ?? []).filter((e) => e.name !== ""), [exchanges.data]);
  const sourceType = sources.find((e) => e.name === source)?.type;
  const destNames = useMemo(
    () => (destType === "queue" ? (queues.data ?? []).map((q) => q.name) : sources.map((e) => e.name)),
    [destType, queues.data, sources],
  );
  const headersEx = sourceType === "headers";
  const keyIgnored = sourceType === "fanout" || headersEx;

  const patch = (id: number, p: Partial<ArgRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const submit = async () => {
    setError(null);
    const args: Record<string, unknown> = {};
    if (headersEx) args["x-match"] = xMatch;
    for (const r of rows) {
      if (!r.key.trim()) continue;
      if (r.type === "number") {
        const n = Number(r.value);
        if (r.value.trim() === "" || Number.isNaN(n)) return setError(`Argument "${r.key}" is not a number`);
        args[r.key] = n;
      } else args[r.key] = r.type === "boolean" ? r.value === "true" : r.value;
    }
    setBusy(true);
    try {
      await rabbit(connectionId).post(paths.bindingPair(vhost, source, destType, dest), {
        routing_key: keyIgnored ? "" : rk,
        arguments: args,
      });
      toast.success(`Bound ${source} to ${destType} ${dest}`);
      for (const k of ["exchange", "exchanges", "queue", "queues", "topology", "publish-routing"]) invalidate(`${connectionId}:${k}`);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const blocked = readOnly
    ? "This connection is read-only."
    : !vhost
      ? "Choose a virtual host."
      : !source
        ? "Choose a source exchange."
        : !dest.trim()
          ? "Choose a destination."
          : null;

  return (
    <Modal
      title="Add binding"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!!blocked || busy} title={blocked ?? undefined} onClick={() => void submit()}>
            Add binding
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!blocked && !busy) void submit();
        }}
      >
        {readOnly && <Notice tone="info">This connection is <b>read-only</b>, so bindings cannot change.</Notice>}
        {context.vhost == null && (
          <Row label="Virtual host">
            <select className={nativeSelect} value={vhost} onChange={(e) => { setVhost(e.target.value); setSource(""); setDest(""); }} aria-label="Virtual host">
              <option value="" disabled>
                Choose a vhost
              </option>
              {(vhosts.data ?? []).map((v) => (
                <option key={v.name}>{v.name}</option>
              ))}
            </select>
          </Row>
        )}
        <Row label="Source exchange" hint={sourceType ? `${sourceType} exchange` : undefined}>
          {data.source ? (
            <Input className={field} value={source} readOnly aria-label="Source exchange" />
          ) : (
            <select className={nativeSelect} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source exchange">
              <option value="" disabled>
                Choose an exchange
              </option>
              {sources.map((e) => (
                <option key={e.name}>{e.name}</option>
              ))}
            </select>
          )}
        </Row>
        <Row label="Destination">
          <div className="flex gap-2">
            <SegmentedControl
              aria-label="Destination type"
              value={destType}
              onChange={(v) => {
                setDestType(v);
                setDest("");
              }}
              options={[
                { value: "queue", label: "Queue" },
                { value: "exchange", label: "Exchange" },
              ]}
            />
            <Input className={field} list="binding-destinations" value={dest} onChange={(e) => setDest(e.target.value)} placeholder={`${destType} name`} aria-label="Destination" autoFocus={!!data.source} />
            <datalist id="binding-destinations">
              {destNames.slice(0, 500).map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
        </Row>

        {headersEx && (
          <Row label="x-match" hint="all: every header below must match. any: one is enough. The -with-x variants also compare x- headers.">
            <select className={nativeSelect} value={xMatch} onChange={(e) => setXMatch(e.target.value)} aria-label="x-match">
              {X_MATCH.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Row>
        )}
        {!keyIgnored && (
          <Row
            label="Routing key"
            hint={sourceType === "topic" ? "* is exactly one word, # is zero or more words." : sourceType === "direct" ? "Must equal the message's routing key." : undefined}
          >
            <Input className={field} value={rk} onChange={(e) => setRk(e.target.value)} spellCheck={false} placeholder={sourceType === "topic" ? "order.*.created" : ""} aria-label="Routing key" />
          </Row>
        )}
        {sourceType === "topic" && (
          <Row label="Try a routing key">
            <div className="flex items-center gap-2">
              <Input className={field} value={tryKey} onChange={(e) => setTryKey(e.target.value)} spellCheck={false} placeholder="order.eu.created" aria-label="Routing key to test" />
              {tryKey !== "" && (
                <span className={topicMatch(rk, tryKey) ? "shrink-0 text-sm text-ok" : "shrink-0 text-sm text-warn"}>
                  {topicMatch(rk, tryKey) ? "matches" : "no match"}
                </span>
              )}
            </div>
          </Row>
        )}

        <Row label={headersEx ? "Headers to match" : "Arguments"}>
          <div className="flex flex-col gap-1">
            {rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_1fr_64px_20px] items-center gap-1">
                <Input className={field} placeholder="key" aria-label="Argument key" value={r.key} onChange={(e) => patch(r.id, { key: e.target.value })} />
                {r.type === "boolean" ? (
                  <select className={nativeSelect} aria-label="Argument value" value={r.value === "true" ? "true" : "false"} onChange={(e) => patch(r.id, { value: e.target.value })}>
                    <option>true</option>
                    <option>false</option>
                  </select>
                ) : (
                  <Input className={field} placeholder="value" aria-label="Argument value" value={r.value} onChange={(e) => patch(r.id, { value: e.target.value })} />
                )}
                <select
                  className={nativeSelect}
                  aria-label="Argument type"
                  value={r.type}
                  onChange={(e) => {
                    const t = e.target.value as ArgType;
                    patch(r.id, { type: t, value: t === "boolean" ? "true" : r.type === "boolean" ? "" : r.value });
                  }}
                >
                  <option value="string">str</option>
                  <option value="number">num</option>
                  <option value="boolean">bool</option>
                </select>
                <button type="button" aria-label="Remove argument" className="grid size-5 place-items-center rounded-xs text-fg-3 hover:bg-hover hover:text-fg" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
                  <X className="size-3" />
                </button>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setRows((rs) => [...rs, { id: ++rowId, key: "", value: "", type: "string" }])}>
              <Plus />
              Add {headersEx ? "header" : "argument"}
            </Button>
          </div>
        </Row>
        {error && (
          <div role="alert" className="text-sm text-danger">
            {error}
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
