import { lazy, Suspense, useCallback, useState } from "react";
import type { ReactNode } from "react";
import { Activity, ArrowRightLeft, Eraser, Inbox, Link, RefreshCw, Reply, Rows3, Send, Trash2, Users } from "lucide-react";
import { Dash, EmptyState, ErrorState, Loading, Metrics, Notice, StateLabel, Tag, ViewTitle, ViewToolbar } from "@/components/data/parts";
import type { MetricItem, Tone } from "@/components/data/parts";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useLive } from "@/hooks/useLive";
import { rabbit } from "@/lib/rabbit/client";
import { bytes, compact, int, percent, rate } from "@/lib/rabbit/format";
import { isReadOnly } from "@/lib/rabbit/guard";
import { paths, sampled, withQuery } from "@/lib/rabbit/paths";
import { openDialog } from "@/store/dialogStore";
import { useSessionsStore } from "@/store/sessionsStore";
import type { Queue } from "@/types/rabbit";
import type { ViewProps } from "../types";
import { useQueueEvents } from "./lib/events";
import { isDlqName, maxLengthOf } from "./lib/messages";
import { useStreamBounds } from "./lib/streamBounds";

const OverviewPanel = lazy(() => import("./OverviewPanel"));
const MessagesPanel = lazy(() => import("./MessagesPanel"));
const ConsumersPanel = lazy(() => import("./ConsumersPanel"));
const BindingsPanel = lazy(() => import("./BindingsPanel"));
const PublishForm = lazy(() => import("@/components/views/publish/PublishForm"));

type QView = "overview" | "messages" | "consumers" | "bindings" | "publish";
const VIEWS: QView[] = ["overview", "messages", "consumers", "bindings", "publish"];

/** The queue's state as a word and a tone. */
function stateOf(q: Queue, dlq: boolean): { tone: Tone; text: string } {
  const ready = q.messages_ready ?? 0;
  if (q.state && q.state !== "running" && q.state !== "idle") return { tone: "crit", text: q.state };
  if (q.members && q.online && q.online.length < q.members.length) return { tone: "warn", text: "Members down" };
  if (dlq) return ready ? { tone: "warn", text: "Dead letters" } : { tone: "ok", text: "Empty" };
  if (!q.consumers && ready > 0 && q.type !== "stream") return { tone: "crit", text: "No consumers" };
  if (q.state === "idle") return { tone: "idle", text: "Idle" };
  return { tone: "ok", text: "Running" };
}

export default function QueueView({ tab, shown }: ViewProps) {
  const cid = tab.connection?.id ?? "";
  const vhost = tab.vhost ?? "/";
  const name = tab.name ?? "";
  const live = useLive<Queue>(
    cid && name ? `${cid}:queue:${vhost}:${name}` : null,
    () => rabbit(cid).get<Queue>(withQuery(paths.queue(vhost, name), sampled(600, 10))),
    { enabled: shown },
  );
  const q = live.data;
  const events = useQueueEvents(cid, q);
  const bounds = useStreamBounds(cid, vhost, name, shown && q?.type === "stream").data;
  const [sawDeaths, setSawDeaths] = useState(false);
  const onSawDeaths = useCallback(() => setSawDeaths(true), []);
  const [deathSummary, setDeathSummary] = useState<{ queue: string; reason: string } | null>(null);
  const dlq = isDlqName(name) || sawDeaths;
  const view: QView = VIEWS.includes(tab.view as QView) ? (tab.view as QView) : isDlqName(name) ? "messages" : "overview";
  const setView = (v: QView) => useSessionsStore.getState().setView(tab.id, v);
  const readOnly = cid ? isReadOnly(cid) : true;
  const ro = readOnly ? "This connection is read-only" : undefined;

  if (!cid || !name) return <EmptyState icon={Inbox} title="No queue" />;
  if (!q) {
    if (live.error) {
      const gone = /not.?found|404/i.test(live.error);
      return gone ? (
        <EmptyState icon={Inbox} title="Queue not found">
          <span className="font-mono">{name}</span> no longer exists in vhost <span className="font-mono">{vhost}</span>.
        </EmptyState>
      ) : (
        <ErrorState error={live.error} onRetry={() => void live.refresh()} />
      );
    }
    return <Loading />;
  }

  const stream = q.type === "stream";
  const ready = q.messages_ready ?? 0;
  const ms = q.message_stats;
  const pub = ms?.publish_details?.rate ?? 0;
  const deliver = ms?.deliver_get_details?.rate ?? ms?.deliver_details?.rate ?? 0;
  const ack = ms?.ack_details?.rate ?? 0;
  const st = stateOf(q, dlq);
  const max = maxLengthOf(q);
  const down = q.members && q.online ? q.members.filter((m) => !q.online!.includes(m)) : [];

  const notices: ReactNode[] = [];
  if (q.state && q.state !== "running" && q.state !== "idle") {
    notices.push(
      <Notice key="state" tone="crit">
        <b>Queue {q.state}.</b> It may not accept or deliver messages until it recovers.
      </Notice>,
    );
  }
  if (down.length) {
    notices.push(
      <Notice key="members" tone="crit">
        <b>
          {down.length} of {q.members!.length} members down.
        </b>{" "}
        <span className="font-mono">{down.join(", ")}</span>
        {q.type === "quorum" && down.length * 2 >= q.members!.length ? " Without a majority the queue can't accept messages." : ""}
      </Notice>,
    );
  }
  if (!dlq && !stream && !q.consumers && ready > 0) {
    notices.push(
      <Notice key="noconsumers" tone="crit">
        <b>No consumers.</b> {int(ready)} messages are waiting
        {pub > 0 ? `, ${rate(pub)} more arriving` : ""}.
      </Notice>,
    );
  } else if (!dlq && !stream && q.consumers && pub > 0 && pub > deliver * 1.2 && ready > 100) {
    notices.push(
      <Notice
        key="backlog"
        tone="crit"
        actions={
          <Button size="sm" onClick={() => setView("consumers")}>
            Consumers
          </Button>
        }
      >
        <b>Publishing outpaces delivery.</b> {rate(pub)} in, {rate(deliver)} out, {q.consumers} consumers
        {q.consumer_utilisation != null ? ` at ${percent(q.consumer_utilisation)} utilisation` : ""}; about{" "}
        {compact((pub - deliver) * 3600)} more messages per hour.
      </Notice>,
    );
  }
  if (dlq && ready > 0) {
    notices.push(
      <Notice
        key="dlq"
        tone="warn"
        actions={
          <Button
            size="sm"
            disabled={readOnly}
            title={ro}
            onClick={() => openDialog("move-messages", { connectionId: cid, vhost, name, data: { target: "origin" } })}
          >
            <Reply className="size-3.5" />
            Replay all…
          </Button>
        }
      >
        <b>{int(ready)} dead-lettered messages.</b>{" "}
        {deathSummary ? (
          <>
            Most came from <span className="font-mono text-[12px] text-fg">{deathSummary.queue}</span>, reason{" "}
            <span className="font-mono text-[12px] text-fg">{deathSummary.reason}</span>.
          </>
        ) : (
          "Peek them to see where they died and why, then replay or move them."
        )}
      </Notice>,
    );
  }
  if (max != null && (q.messages ?? 0) >= max) {
    const overflow = q.arguments?.["x-overflow"] ?? q.effective_policy_definition?.["overflow"] ?? "drop-head";
    notices.push(
      <Notice key="max" tone="warn">
        <b>At max length.</b> {int(q.messages)} of {int(max)} messages;{" "}
        {overflow === "drop-head" ? "the oldest are dropped (or dead-lettered) as new ones arrive." : `overflow is ${String(overflow)}.`}
      </Notice>,
    );
  }

  const metrics: MetricItem[] = stream
    ? [
        { label: "Messages", value: int(q.messages), detail: "retained in the log" },
        { label: "Incoming", value: rate(pub), detail: "publish" },
        { label: "First offset", value: int(q.first_offset ?? bounds?.first), detail: "oldest kept" },
        {
          label: "Last offset",
          value: int(
            q.committed_offset ??
              (bounds?.first != null && q.messages ? bounds.first + q.messages - 1 : undefined),
          ),
          detail: q.committed_offset != null ? "committed" : "last written",
        },
        { label: "Segments", value: int(q.segments), detail: "on disk" },
        { label: "Consumers", value: int(q.consumers), detail: q.consumers ? "reading" : "none attached", onClick: () => setView("consumers") },
        { label: "Memory", value: bytes(q.memory), detail: `${q.members?.length ?? 1} replicas` },
      ]
    : [
        { label: "Ready", value: int(ready), detail: "waiting for delivery", tone: st.tone === "crit" ? "crit" : undefined },
        { label: "Unacked", value: int(q.messages_unacknowledged), detail: "delivered, not acked" },
        { label: "Total", value: int(q.messages), detail: bytes(q.message_bytes) },
        { label: "Incoming", value: rate(pub), detail: "publish" },
        { label: "Delivered", value: rate(deliver), detail: `deliver + get · ack ${rate(ack)}` },
        {
          label: "Consumers",
          value: int(q.consumers),
          detail: q.consumers ? `prefetch ${int(q.consumer_details?.[0]?.prefetch_count)}` : "none attached",
          tone: !q.consumers && ready > 0 && !dlq ? "crit" : undefined,
          onClick: () => setView("consumers"),
        },
        {
          label: "Utilisation",
          value: q.consumer_utilisation != null ? percent(q.consumer_utilisation) : <Dash />,
          detail: "consumer capacity",
        },
        {
          label: "Memory",
          value: bytes(q.memory),
          detail: q.type === "quorum" ? `${q.members?.length ?? 0} replicas` : "single node",
        },
      ];

  const nConsumers = q.consumers ?? 0;
  // Below 760px of toolbar the segments keep their icons only (title names them).
  const lbl = (text: ReactNode) => <span className="@max-[900px]:hidden">{text}</span>;
  const views = [
    { value: "overview" as const, label: lbl("Overview"), icon: <Activity />, title: "Overview" },
    { value: "messages" as const, label: lbl("Messages"), icon: <Rows3 />, title: "Messages" },
    {
      value: "consumers" as const,
      label: lbl(
        <>
          Consumers <span className="text-fg-3">{nConsumers}</span>
        </>,
      ),
      icon: <Users />,
      title: `Consumers ${nConsumers}`,
    },
    { value: "bindings" as const, label: lbl("Bindings"), icon: <Link />, title: "Bindings" },
    { value: "publish" as const, label: lbl("Publish"), icon: <Send />, title: "Publish" },
  ];

  let body: ReactNode;
  switch (view) {
    case "overview":
      body = <OverviewPanel queue={q} events={events} />;
      break;
    case "messages":
      body = <MessagesPanel cid={cid} vhost={vhost} name={name} queue={q} focus={tab.focus} onSawDeaths={onSawDeaths} onDeathSummary={setDeathSummary} />;
      break;
    case "consumers":
      body = <ConsumersPanel cid={cid} queue={q} dlq={dlq} />;
      break;
    case "bindings":
      body = <BindingsPanel cid={cid} vhost={vhost} name={name} shown={shown} />;
      break;
    case "publish":
      body = (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <PublishForm connectionId={cid} vhost={vhost} exchange="" routingKey={name} onPublished={() => void live.refresh()} />
        </div>
      );
      break;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <ViewToolbar>
        <ViewTitle icon={Inbox} name={name} />
        <Tag title="Queue type">{q.type ?? "classic"}</Tag>
        <span className="shrink-0 font-mono text-[12px] text-fg-3 @max-[1180px]:hidden" title="Virtual host">
          {vhost}
        </span>
        <span className="shrink-0 @max-[1180px]:hidden">
          <StateLabel tone={st.tone}>{st.text}</StateLabel>
        </span>
        {q.policy && (
          <Tag title="Policy" className="@max-[1180px]:hidden">
            {q.policy}
          </Tag>
        )}
        <SegmentedControl<QView> aria-label="View" value={view} onChange={setView} options={views} className="ml-2" />
        <span className="flex-1" />
        {!stream && (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={readOnly || !ready}
              title={ro ?? (ready ? undefined : "The queue is empty")}
              onClick={() => openDialog("move-messages", { connectionId: cid, vhost, name })}
            >
              <ArrowRightLeft />
              <span className="@max-[1000px]:hidden">Move</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger"
              disabled={readOnly || !ready}
              title={ro ?? (ready ? undefined : "The queue is empty")}
              onClick={() => openDialog("purge-queue", { connectionId: cid, vhost, name })}
            >
              <Eraser />
              <span className="@max-[1000px]:hidden">Purge</span>
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-danger"
          disabled={readOnly}
          title={ro}
          onClick={() => openDialog("delete-queue", { connectionId: cid, vhost, name, data: { tabId: tab.id } })}
        >
          <Trash2 />
          <span className="@max-[1000px]:hidden">Delete</span>
        </Button>
        <Button variant="ghost" size="icon-sm" title="Refresh" aria-label="Refresh" onClick={() => void live.refresh()}>
          <RefreshCw />
        </Button>
      </ViewToolbar>
      {notices}
      {view !== "messages" && view !== "publish" && <Metrics items={metrics} />}
      <Suspense fallback={<Loading />}>{body}</Suspense>
    </div>
  );
}
