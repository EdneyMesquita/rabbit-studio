import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CircleCheck, CircleX, Inbox, Plus, RefreshCw, Send, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Dash, Notice, SectionHeader } from "@/components/data/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { rabbit, errorText } from "@/lib/rabbit/client";
import { isReadOnly } from "@/lib/rabbit/guard";
import { paths, withQuery } from "@/lib/rabbit/paths";
import { useLive } from "@/hooks/useLive";
import { useConnectionsStore } from "@/store/connectionsStore";
import { cn } from "@/lib/utils";
import type { Binding, Exchange, MessageProperties } from "@/types/rabbit";
import { bindingLabel, route } from "./routing";

interface Props {
  connectionId: string;
  vhost: string;
  exchange?: string;
  routingKey?: string;
  payload?: string;
  properties?: MessageProperties;
  onPublished?: () => void;
}

type HeaderType = "string" | "number" | "boolean";
interface HeaderRow {
  id: number;
  key: string;
  value: string;
  type: HeaderType;
}

type PickerExchange = Pick<Exchange, "name" | "type" | "internal">;
type RouteBinding = Pick<Binding, "source" | "vhost" | "destination" | "destination_type" | "routing_key" | "arguments" | "properties_key">;

interface RoutingData {
  exchanges: PickerExchange[];
  bindings: RouteBinding[];
}

let rowId = 0;

function headerRows(headers: Record<string, unknown> | undefined): HeaderRow[] {
  return Object.entries(headers ?? {}).map(([key, v]) => ({
    id: ++rowId,
    key,
    type: typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : "string",
    value: typeof v === "object" && v !== null ? JSON.stringify(v) : String(v),
  }));
}

/** The headers as the API wants them; a message for the user if a value doesn't fit its type. */
function headersOf(rows: HeaderRow[]): { headers: Record<string, unknown>; error: string | null } {
  const headers: Record<string, unknown> = {};
  let error: string | null = null;
  for (const r of rows) {
    if (!r.key.trim()) continue;
    if (r.type === "number") {
      const n = Number(r.value);
      if (r.value.trim() === "" || Number.isNaN(n)) error ??= `Header "${r.key}" is not a number`;
      headers[r.key] = n;
    } else if (r.type === "boolean") headers[r.key] = r.value === "true";
    else headers[r.key] = r.value;
  }
  return { headers, error };
}

function base64Ok(s: string): boolean {
  try {
    atob(s.replace(/\s+/g, ""));
    return true;
  } catch {
    return false;
  }
}

/** A labelled box of the query bar (the mockup's .qfield). */
function QField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label
      className={cn(
        "flex h-7 min-w-0 items-center gap-2 rounded-sm border border-field-line bg-field px-2 focus-within:border-accent",
        className,
      )}
    >
      <span className="shrink-0 text-xs text-fg-3">{label}</span>
      {children}
    </label>
  );
}

const bare = "min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-fg outline-none placeholder:font-sans placeholder:text-fg-3";

function PropRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid grid-cols-[96px_1fr] items-center gap-2 px-3 text-sm">
      <span className="truncate text-fg-3">{label}</span>
      {children}
    </label>
  );
}

const fieldCls = "h-7 px-2 font-mono text-[12.5px]";
const nativeSelect =
  "h-7 min-w-0 rounded-sm border border-field-line bg-field px-1.5 text-[12.5px] text-fg outline-none focus:border-accent";

/**
 * Compose and publish one message (or a few) through the management API:
 * shared by the exchange view, the queue view and the publish dialog. It
 * previews which queues the message would reach from the vhost's bindings.
 */
export default function PublishForm({ connectionId, vhost, exchange, routingKey, payload, properties, onPublished }: Props) {
  const readOnly = isReadOnly(connectionId);
  const production = useConnectionsStore((s) => s.profiles.find((p) => p.id === connectionId)?.environment === "production");

  const [ex, setEx] = useState(exchange ?? "");
  const [rk, setRk] = useState(routingKey ?? "");
  const [body, setBody] = useState(payload ?? "");
  const [encoding, setEncoding] = useState<"string" | "base64">("string");
  const [contentType, setContentType] = useState(properties?.content_type ?? "application/json");
  const [mode, setMode] = useState<"2" | "1">(properties?.delivery_mode === 1 ? "1" : "2");
  const [priority, setPriority] = useState(properties?.priority != null ? String(properties.priority) : "");
  const [correlationId, setCorrelationId] = useState(properties?.correlation_id ?? "");
  const [messageId, setMessageId] = useState(properties?.message_id ?? "");
  const [replyTo, setReplyTo] = useState(properties?.reply_to ?? "");
  const [expiration, setExpiration] = useState(properties?.expiration ?? "");
  const [type, setType] = useState(properties?.type ?? "");
  const [appId, setAppId] = useState(properties?.app_id ?? "");
  const [stamp, setStamp] = useState(properties?.timestamp != null);
  const [rows, setRows] = useState<HeaderRow[]>(() => headerRows(properties?.headers));
  const [count, setCount] = useState("1");
  const [busy, setBusy] = useState<string | null>(null);

  // One read of the vhost's exchanges and bindings; refreshed by hand or when older than 30 s.
  const routing = useLive<RoutingData>(
    `${connectionId}:publish-routing:${vhost}`,
    async () => {
      const api = rabbit(connectionId);
      const [exchanges, bindings] = await Promise.all([
        api.get<PickerExchange[]>(withQuery(paths.exchanges(vhost), { columns: "name,type,internal" })),
        api.get<RouteBinding[]>(paths.bindings(vhost)),
      ]);
      return { exchanges, bindings };
    },
    { interval: 0 },
  );
  const refreshRouting = routing.refresh;
  const routingAt = routing.updatedAt;
  useEffect(() => {
    if (routingAt && Date.now() - routingAt > 30_000) void refreshRouting();
  }, []);

  const exchangeOptions = useMemo(() => {
    const list = (routing.data?.exchanges ?? []).filter((e) => e.name !== "" && !e.internal);
    const names = list.map((e) => e.name);
    if (ex !== "" && !names.includes(ex)) names.push(ex);
    names.sort((a, b) => Number(a.startsWith("amq.")) - Number(b.startsWith("amq.")) || a.localeCompare(b));
    return names;
  }, [routing.data, ex]);

  const { headers, error: headerError } = useMemo(() => headersOf(rows), [rows]);
  const dRk = useDeferredValue(rk);
  const dHeaders = useDeferredValue(headers);
  const reached = useMemo(
    () => (routing.data ? route(ex, dRk, dHeaders, routing.data.bindings as Binding[], routing.data.exchanges) : null),
    [routing.data, ex, dRk, dHeaders],
  );
  const typeOf = useMemo(() => new Map((routing.data?.exchanges ?? []).map((e) => [e.name, e.type])), [routing.data]);

  const json = useMemo(() => {
    if (encoding !== "string" || !body.trim()) return null;
    try {
      JSON.parse(body);
      return true;
    } catch {
      return false;
    }
  }, [body, encoding]);
  const wantsJson = /json/i.test(contentType);
  const lines = useMemo(() => body.split("\n").length, [body]);
  const gutter = useMemo(() => Array.from({ length: lines }, (_, i) => i + 1).join("\n"), [lines]);

  const payloadError = encoding === "base64" && body.trim() && !base64Ok(body) ? "Payload is not valid base64" : null;
  const priorityError = priority !== "" && !/^\d{1,3}$/.test(priority) ? "Priority is a number" : null;
  const problem = headerError ?? payloadError ?? priorityError;
  const propCount = [contentType.trim(), priority, correlationId, messageId, replyTo, expiration, type, appId].filter(Boolean).length + 1 + (stamp ? 1 : 0);
  const times = Math.max(1, Math.min(1000, Math.floor(Number(count)) || 1));
  const blocked = readOnly ? "This connection is read-only, so publishing is disabled." : problem;

  const publish = async () => {
    if (blocked || busy) return;
    const props: MessageProperties = { delivery_mode: Number(mode) };
    if (contentType.trim()) props.content_type = contentType.trim();
    if (Object.keys(headers).length) props.headers = headers;
    if (priority !== "") props.priority = Number(priority);
    if (correlationId) props.correlation_id = correlationId;
    if (messageId) props.message_id = messageId;
    if (replyTo) props.reply_to = replyTo;
    if (expiration) props.expiration = expiration;
    if (type) props.type = type;
    if (appId) props.app_id = appId;
    if (stamp) props.timestamp = Math.floor(Date.now() / 1000);
    const api = rabbit(connectionId);
    let routed = 0;
    let sent = 0;
    try {
      for (let i = 0; i < times; i++) {
        setBusy(times > 1 ? `Publishing ${i + 1} of ${times}` : "Publishing");
        const res = await api.post<{ routed: boolean }>(paths.exchangePublish(vhost, ex), {
          properties: props,
          routing_key: rk,
          payload: body,
          payload_encoding: encoding,
        });
        sent++;
        if (res?.routed) routed++;
      }
    } catch (e) {
      toast.error(`${sent ? `Published ${sent} of ${times}, then failed` : "Publish failed"}: ${errorText(e)}`);
      return;
    } finally {
      setBusy(null);
    }
    const msg = times > 1 ? `${sent} messages` : "Message";
    if (routed === sent) {
      const n = reached?.length;
      toast.success(n != null ? `${msg} published, routed to ${n} ${n === 1 ? "queue" : "queues"}` : `${msg} published, routed`);
    } else toast.warning(`${msg} published, but ${routed ? `only ${routed} were` : "it was not"} routed to a queue`);
    onPublished?.();
  };

  const patchRow = (id: number, patch: Partial<HeaderRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          void publish();
        }
      }}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
        <QField label="exchange" className="w-[240px] max-w-full flex-[0_1_240px]">
          <select value={ex} onChange={(e) => setEx(e.target.value)} className={cn(bare, "cursor-pointer")} aria-label="Exchange">
            <option value="">(default)</option>
            {exchangeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </QField>
        <QField label="routing key" className="min-w-[160px] flex-1">
          <input value={rk} onChange={(e) => setRk(e.target.value)} spellCheck={false} className={bare} aria-label="Routing key" />
        </QField>
        <SegmentedControl
          aria-label="Delivery mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "2", label: "Persistent" },
            { value: "1", label: "Transient" },
          ]}
        />
        <QField label="times" className="w-[84px]">
          <input
            value={count}
            onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            className={cn(bare, "text-right")}
            aria-label="Number of messages"
          />
        </QField>
        <Button variant="primary" disabled={!!blocked || !!busy} onClick={() => void publish()} title={blocked ?? undefined}>
          <Send />
          {busy ?? (times > 1 ? `Publish ${times} times` : "Publish")}
          <kbd className="rounded-xs bg-white/20 px-1 font-sans text-[10px]">Ctrl ⏎</kbd>
        </Button>
      </div>
      {readOnly ? (
        <Notice tone="info">
          This connection is <b>read-only</b>, so publishing is disabled.
        </Notice>
      ) : (
        (production || problem) && (
          <Notice tone={production ? "crit" : "warn"}>
            {production && (
              <>
                Publishing to a <b>production</b> connection. Real consumers will process this message.
              </>
            )}
            {production && problem && " "}
            {problem}
          </Notice>
        )
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line-soft px-3 text-sm text-fg-2">
            <span>Payload</span>
            <span className="min-w-0 truncate font-mono text-[12px] text-fg-3">{contentType.trim() || "no content type"}</span>
            <span className="flex-1" />
            <SegmentedControl
              aria-label="Payload encoding"
              value={encoding}
              onChange={setEncoding}
              options={[
                { value: "string", label: "Text" },
                { value: "base64", label: "Base64" },
              ]}
            />
            {json === true && (
              <span className="inline-flex items-center gap-1 text-ok">
                <CircleCheck className="size-3" aria-hidden />
                valid JSON
              </span>
            )}
            {json === false && (
              <span className={cn("inline-flex items-center gap-1", wantsJson ? "text-danger" : "text-warn")}>
                {wantsJson ? <CircleX className="size-3" aria-hidden /> : <TriangleAlert className="size-3" aria-hidden />}
                invalid JSON
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={json !== true}
              onClick={() => setBody(JSON.stringify(JSON.parse(body), null, 2))}
            >
              Format
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 overflow-auto font-mono text-[13px] leading-5 [font-variant-ligatures:none]">
            <div
              aria-hidden
              className={cn(
                "w-12 flex-none py-2 pr-3.5 text-right whitespace-pre text-fg-3 select-none",
                json === false && wantsJson && "text-danger",
              )}
            >
              {gutter}
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              spellCheck={false}
              aria-label="Payload"
              placeholder={encoding === "base64" ? "Base64-encoded bytes" : '{ "event": "order.created" }'}
              style={{ height: lines * 20 + 16, minHeight: "100%" }}
              className="min-w-0 flex-1 resize-none overflow-x-auto overflow-y-hidden border-0 bg-transparent py-2 pr-3 pl-1 leading-5 whitespace-pre text-fg caret-accent outline-none [tab-size:2] placeholder:text-fg-3"
            />
          </div>
        </div>

        <aside aria-label="Routing and properties" className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-l border-line max-[900px]:hidden [&>*]:shrink-0">
          <SectionHeader
            actions={
              <Button variant="ghost" size="icon-xs" aria-label="Refresh routing" title="Reload bindings" onClick={() => void refreshRouting()}>
                <RefreshCw className={cn(routing.loading && "animate-spin")} />
              </Button>
            }
          >
            Routing
          </SectionHeader>
          {routing.error && !routing.data && <div className="px-3 py-2 text-sm text-danger">{routing.error}</div>}
          {reached && (
            <>
              <div className="px-3 pt-1 pb-1 text-sm text-fg-2">
                Delivered to <b className="font-medium text-fg">{reached.length}</b> {reached.length === 1 ? "queue" : "queues"}
              </div>
              {reached.length === 0 ? (
                <div className="flex items-start gap-2 px-3 pb-2 text-sm text-warn">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>Unroutable: no binding matches. The broker drops the message.</span>
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto pb-1">
                  {reached.map((r) => (
                    <div key={r.queue} className="flex h-[26px] items-center gap-2 px-3 font-mono text-[12px]" title={r.queue}>
                      <Inbox className="size-3.5 shrink-0 text-fg-3" aria-hidden />
                      <span className="min-w-0 truncate">{r.queue}</span>
                      <span className="ml-auto max-w-[45%] shrink-0 truncate text-[11px] text-fg-3">
                        {r.via.map((b) => bindingLabel(b, typeOf.get(b.source))).join(" → ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <SectionHeader
            count={rows.length || undefined}
            actions={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Add header"
                onClick={() => setRows((rs) => [...rs, { id: ++rowId, key: "", value: "", type: "string" }])}
              >
                <Plus />
              </Button>
            }
          >
            Headers
          </SectionHeader>
          <div className="flex flex-col gap-1 px-3 pb-2">
            {rows.length === 0 && <Dash />}
            {rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_1fr_64px_20px] items-center gap-1">
                <Input className={fieldCls} placeholder="key" aria-label="Header key" value={r.key} onChange={(e) => patchRow(r.id, { key: e.target.value })} />
                {r.type === "boolean" ? (
                  <select className={nativeSelect} aria-label="Header value" value={r.value === "true" ? "true" : "false"} onChange={(e) => patchRow(r.id, { value: e.target.value })}>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <Input className={fieldCls} placeholder="value" aria-label="Header value" value={r.value} onChange={(e) => patchRow(r.id, { value: e.target.value })} />
                )}
                <select
                  className={nativeSelect}
                  aria-label="Header type"
                  value={r.type}
                  onChange={(e) => {
                    const t = e.target.value as HeaderType;
                    patchRow(r.id, { type: t, value: t === "boolean" ? "true" : r.type === "boolean" ? "" : r.value });
                  }}
                >
                  <option value="string">str</option>
                  <option value="number">num</option>
                  <option value="boolean">bool</option>
                </select>
                <button type="button" aria-label="Remove header" className="grid size-5 place-items-center rounded-xs text-fg-3 hover:bg-hover hover:text-fg" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>

          <SectionHeader count={propCount}>Properties</SectionHeader>
          <div className="flex flex-col gap-1.5 pb-3">
            <PropRow label="content_type">
              <Input className={fieldCls} list="pub-content-types" value={contentType} onChange={(e) => setContentType(e.target.value)} />
            </PropRow>
            <datalist id="pub-content-types">
              <option value="application/json" />
              <option value="text/plain" />
              <option value="application/octet-stream" />
              <option value="application/xml" />
            </datalist>
            <PropRow label="priority">
              <Input className={fieldCls} inputMode="numeric" placeholder="0 to 255" aria-invalid={!!priorityError} value={priority} onChange={(e) => setPriority(e.target.value)} />
            </PropRow>
            <PropRow label="correlation_id">
              <Input className={fieldCls} value={correlationId} onChange={(e) => setCorrelationId(e.target.value)} />
            </PropRow>
            <PropRow label="message_id">
              <span className="flex gap-1">
                <Input className={fieldCls} value={messageId} onChange={(e) => setMessageId(e.target.value)} />
                <Button size="sm" className="h-7" onClick={() => setMessageId(crypto.randomUUID())}>
                  Generate
                </Button>
              </span>
            </PropRow>
            <PropRow label="reply_to">
              <Input className={fieldCls} value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
            </PropRow>
            <PropRow label="expiration">
              <Input className={fieldCls} inputMode="numeric" placeholder="ms" value={expiration} onChange={(e) => setExpiration(e.target.value.replace(/\D/g, ""))} />
            </PropRow>
            <PropRow label="type">
              <Input className={fieldCls} value={type} onChange={(e) => setType(e.target.value)} />
            </PropRow>
            <PropRow label="app_id">
              <Input className={fieldCls} value={appId} onChange={(e) => setAppId(e.target.value)} />
            </PropRow>
            <PropRow label="timestamp">
              <span className="flex items-center gap-2 text-fg-2">
                <Switch size="sm" checked={stamp} onCheckedChange={setStamp} aria-label="Set the timestamp to now" />
                {stamp ? "now, when published" : <Dash />}
              </span>
            </PropRow>
          </div>
        </aside>
      </div>
    </div>
  );
}
