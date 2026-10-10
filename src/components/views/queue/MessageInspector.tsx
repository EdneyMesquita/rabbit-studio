import { memo } from "react";
import { ArrowRightLeft, Copy, Reply, Send, Trash2 } from "lucide-react";
import { Inspector } from "@/components/data/Inspector";
import { JsonView } from "@/components/data/JsonView";
import { TypedTree } from "@/components/data/TypedTree";
import { Dash, KeyHints, SectionHeader } from "@/components/data/parts";
import { Button } from "@/components/ui/button";
import { bytes, dateTime, int } from "@/lib/rabbit/format";
import { hexDump, originOf, secondsToMs, type Row } from "./lib/messages";

export interface MessageActions {
  copy: (row: Row) => void;
  replay: (row: Row) => void;
  move: (row: Row) => void;
  republish: (row: Row) => void;
  discard: (row: Row) => void;
}

const btn = "h-6 gap-1 px-2 text-sm";

/** The selected message: x-death first, then properties, headers, payload. */
export const MessageInspector = memo(function MessageInspector({
  row,
  actions,
  canWrite,
  writeReason,
  onClose,
}: {
  row: Row;
  actions: MessageActions;
  /** Moving, replaying and deleting are possible (AMQP on, not read-only). */
  canWrite: boolean;
  writeReason?: string;
  onClose: () => void;
}) {
  const { msg, props, headers, deaths } = row;
  const origin = originOf(row);
  const last = deaths[0];
  const propTree: Record<string, unknown> = {
    exchange: msg.exchange === "" ? "(AMQP default)" : msg.exchange,
    routing_key: msg.routing_key,
    redelivered: msg.redelivered,
    ...(msg.offset != null ? { offset: msg.offset } : {}),
  };
  for (const [k, v] of Object.entries(props)) {
    if (k === "headers") continue;
    propTree[k] = k === "timestamp" ? dateTime(secondsToMs(v)) : v;
  }
  const headerCount = Object.keys(headers).length;
  const ctype = props.content_type ?? (row.json !== undefined ? "json" : row.binary ? "binary" : "text");
  const xError = headers["x-error"] ?? headers["x-exception-message"];

  return (
    <Inspector
      label="Message"
      title={<>Message {props.message_id && <span className="font-normal text-fg-3">{props.message_id}</span>}</>}
      subtitle={msg.offset != null ? `offset ${int(msg.offset)}` : `#${row.index + 1}`}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" size="icon-sm" title="Copy payload" aria-label="Copy payload" onClick={() => actions.copy(row)}>
            <Copy />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Republish to… (R)" aria-label="Republish" onClick={() => actions.republish(row)}>
            <Send />
          </Button>
        </>
      }
    >
      {last && (
        <div className="m-3 overflow-hidden rounded-md border border-line-soft">
          <div className="flex h-[30px] items-center gap-1.5 border-b border-line-soft px-2.5 text-sm text-fg-2">
            <Reply className="size-3.5 shrink-0 text-accent-text" aria-hidden />
            <span className="shrink-0">dead-lettered from</span>
            <span className="truncate font-mono text-[12px] text-fg">{origin?.queue ?? last.queue}</span>
            <span className="flex-1" />
            <span className="shrink-0 text-xs text-fg-3">
              {last.reason} · {last.count}×
            </span>
          </div>
          {deaths.map((d, i) => (
            <dl key={i} className="grid grid-cols-[96px_1fr] gap-x-2 gap-y-0.5 border-b border-line-soft px-2.5 py-1.5 font-mono text-[12px] last:border-b-0">
              {deaths.length > 1 && (
                <>
                  <dt className="text-fg-3">death</dt>
                  <dd className="text-fg-2">
                    {i + 1} of {deaths.length}
                  </dd>
                </>
              )}
              <dt className="text-json-key">queue</dt>
              <dd className="truncate">{d.queue}</dd>
              <dt className="text-json-key">exchange</dt>
              <dd className="truncate">{d.exchange === "" ? "(AMQP default)" : d.exchange}</dd>
              <dt className="text-json-key">routing keys</dt>
              <dd className="truncate">{d["routing-keys"]?.length ? d["routing-keys"].join(", ") : <Dash />}</dd>
              <dt className="text-json-key">reason</dt>
              <dd className="text-json-keyword">
                {d.reason} · {d.count}×
              </dd>
              <dt className="text-json-key">died at</dt>
              <dd className="text-json-bson">{dateTime(secondsToMs(d.time))}</dd>
              {i === 0 && xError != null && (
                <>
                  <dt className="text-json-key">x-error</dt>
                  <dd className="text-json-string break-all whitespace-normal">{JSON.stringify(xError)}</dd>
                </>
              )}
            </dl>
          ))}
          {origin && (
            <div className="px-2.5 py-1.5">
              <Button size="sm" disabled={!canWrite} title={canWrite ? undefined : writeReason} onClick={() => actions.replay(row)}>
                <Reply />
                Replay to <span className="font-mono text-[12px]">{origin.exchange || origin.queue}</span>
              </Button>
            </div>
          )}
        </div>
      )}

      <SectionHeader count={Object.keys(propTree).length}>Properties</SectionHeader>
      <TypedTree value={propTree} open={1} />

      <SectionHeader count={headerCount}>Headers</SectionHeader>
      {headerCount ? (
        <TypedTree value={headers} open={1} />
      ) : (
        <div className="px-3 py-1">
          <Dash />
        </div>
      )}

      <SectionHeader count={`${ctype} · ${bytes(msg.payload_bytes)}`}>Payload</SectionHeader>
      {row.binary ? (
        <pre className="overflow-x-auto px-3 py-2 font-data text-fg-2">{hexDump(row.binary)}</pre>
      ) : row.json !== undefined ? (
        <JsonView value={row.json} defaultDepth={3} className="px-3 py-2" />
      ) : (
        <pre className="px-3 py-2 font-data break-all whitespace-pre-wrap text-fg">{row.text || <Dash />}</pre>
      )}
      {msg.payload_bytes > row.text.length && !row.binary && row.msg.payload_encoding === "string" && (
        <div className="px-3 pb-2 text-xs text-fg-3">Truncated to {bytes(row.text.length)} for display.</div>
      )}

      <SectionHeader>Actions</SectionHeader>
      <div className="flex flex-wrap gap-1.5 px-3 pt-1 pb-3">
        <Button className={btn} onClick={() => actions.copy(row)}>
          <Copy className="size-3.5" />
          Copy payload
        </Button>
        {origin && (
          <Button className={btn} disabled={!canWrite} title={canWrite ? undefined : writeReason} onClick={() => actions.replay(row)}>
            <Reply className="size-3.5" />
            Replay
          </Button>
        )}
        <Button className={btn} disabled={!canWrite} title={canWrite ? undefined : writeReason} onClick={() => actions.move(row)}>
          <ArrowRightLeft className="size-3.5" />
          Move…
        </Button>
        <Button className={btn} onClick={() => actions.republish(row)}>
          <Send className="size-3.5" />
          Republish to…
        </Button>
        <Button
          className={btn + " text-danger"}
          variant="ghost"
          disabled={!canWrite}
          title={canWrite ? undefined : writeReason}
          onClick={() => actions.discard(row)}
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      </div>
      {/* The scroller is the Inspector's, so the hints stick to its bottom. */}
      <div className="sticky bottom-0 bg-editor">
        <KeyHints hints={[["Republish", "R"], ...(origin ? ([["Replay", "⏎"]] as [string, string][]) : []), ["Copy", "Ctrl C"]]} />
      </div>
    </Inspector>
  );
});
