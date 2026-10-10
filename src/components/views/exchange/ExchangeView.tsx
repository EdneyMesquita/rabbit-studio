import { useMemo } from "react";
import { Link2, Split, Trash2, Waypoints } from "lucide-react";
import { toast } from "sonner";
import { ActionMenuButton } from "@/components/common/ActionMenu";
import { TimeSeriesChart, rateSamples } from "@/components/charts/TimeSeriesChart";
import { TypedTree } from "@/components/data/TypedTree";
import { DataTable, type Column } from "@/components/data/DataTable";
import {
  EmptyState,
  ErrorState,
  KeyValues,
  Loading,
  Metrics,
  SectionHeader,
  Spacer,
  Tag,
  ViewTitle,
  ViewToolbar,
  Dash,
} from "@/components/data/parts";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useLive, invalidate } from "@/hooks/useLive";
import { rabbit, errorText } from "@/lib/rabbit/client";
import { rate } from "@/lib/rabbit/format";
import { confirmDestructive, isReadOnly } from "@/lib/rabbit/guard";
import { openOn } from "@/lib/rabbit/nav";
import { paths, sampled, withQuery } from "@/lib/rabbit/paths";
import { openDialog } from "@/store/dialogStore";
import { useSessionsStore } from "@/store/sessionsStore";
import type { Binding, Exchange } from "@/types/rabbit";
import PublishForm from "../publish/PublishForm";
import type { ViewProps } from "../types";

type ExchangeView = "overview" | "bindings" | "publish";

const bindingKey = (b: Binding) => `${b.source}\u0000${b.destination_type}\u0000${b.destination}\u0000${b.properties_key}`;
const argsText = (a: Record<string, unknown> | undefined) => (a && Object.keys(a).length ? JSON.stringify(a) : "");
const isSystem = (name: string) => name === "" || name.startsWith("amq.");

export default function ExchangeView({ tab, shown }: ViewProps) {
  const connectionId = tab.connection?.id ?? null;
  const vhost = tab.vhost ?? "/";
  const name = tab.name ?? "";
  const view = (["overview", "bindings", "publish"].includes(tab.view ?? "") ? tab.view : "overview") as ExchangeView;
  if (!connectionId) return <EmptyState title="No connection">This tab is not on a connection.</EmptyState>;
  return <Body tabId={tab.id} connectionId={connectionId} vhost={vhost} name={name} view={view} shown={shown} />;
}

function Body({
  tabId,
  connectionId,
  vhost,
  name,
  view,
  shown,
}: {
  tabId: string;
  connectionId: string;
  vhost: string;
  name: string;
  view: ExchangeView;
  shown: boolean;
}) {
  const key = `${connectionId}:exchange:${vhost}:${name}`;
  const readOnly = isReadOnly(connectionId);
  const api = rabbit(connectionId);

  const exchange = useLive<Exchange>(
    key,
    () => rabbit(connectionId).get(withQuery(paths.exchange(vhost, name), sampled(600, 10))),
    { enabled: shown },
  );
  const outgoing = useLive<Binding[]>(`${key}:out`, () => rabbit(connectionId).get(paths.exchangeBindingsSource(vhost, name)), {
    interval: 10_000,
    enabled: shown,
  });
  const incoming = useLive<Binding[]>(`${key}:in`, () => rabbit(connectionId).get(paths.exchangeBindingsDestination(vhost, name)), {
    interval: 10_000,
    enabled: shown && name !== "",
  });

  const reload = () => {
    invalidate(`${connectionId}:exchange:${vhost}:${name}`);
    invalidate(`${connectionId}:exchanges`);
    invalidate(`${connectionId}:publish-routing`);
    invalidate(`${connectionId}:topology`);
  };

  const unbind = async (b: Binding) => {
    const ok = await confirmDestructive(connectionId, {
      title: "Remove binding",
      message: `Unbind ${b.source || "(default)"} from ${b.destination_type} ${b.destination}${b.routing_key ? ` (routing key ${b.routing_key})` : ""}? Messages stop flowing through it.`,
      confirmLabel: "Unbind",
    });
    if (!ok) return;
    try {
      // properties_key comes percent-encoded; the path builder encodes once.
      await api.del(paths.binding(vhost, b.source, b.destination_type, b.destination, decodeURIComponent(b.properties_key)));
      toast.success("Binding removed");
      reload();
    } catch (e) {
      toast.error(`Could not remove the binding: ${errorText(e)}`);
    }
  };

  const open = (type: "queue" | "exchange", n: string) => openOn(connectionId, { kind: type, vhost, name: n });

  const columns = useMemo(
    () => bindingColumns({ side: "out", readOnly, open, unbind }),
    // open/unbind close over stable ids only.
    [readOnly, connectionId, vhost, name],
  );
  const inColumns = useMemo(
    () => bindingColumns({ side: "in", readOnly, open, unbind }),
    [readOnly, connectionId, vhost, name],
  );

  const e = exchange.data;
  const stats = e?.message_stats;
  const series = useMemo(
    () => [
      { label: "publish in", color: "s1" as const, points: rateSamples(stats?.publish_in_details) },
      { label: "publish out", color: "s2" as const, points: rateSamples(stats?.publish_out_details) },
    ],
    [stats?.publish_in_details, stats?.publish_out_details],
  );

  if (!e && exchange.error) return <ErrorState error={exchange.error} onRetry={() => void exchange.refresh()} />;
  if (!e) return <Loading />;

  const display = name === "" ? "(default)" : name;
  const custom = e.arguments && Object.keys(e.arguments).length > 0;
  const setView = (v: ExchangeView) => useSessionsStore.getState().setView(tabId, v);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-editor">
      <ViewToolbar>
        <ViewTitle icon={Split} name={display} kind="exchange" />
        <Tag>{e.type}</Tag>
        {e.durable && <Tag title="Survives a broker restart">durable</Tag>}
        {e.auto_delete && <Tag title="Deleted when its last binding goes">auto-delete</Tag>}
        {e.internal && <Tag title="Only other exchanges can publish to it">internal</Tag>}
        {e.policy && <Tag title="Policy applied to this exchange">{`policy ${e.policy}`}</Tag>}
        <Spacer />
        <SegmentedControl
          aria-label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "overview", label: "Overview" },
            { value: "bindings", label: "Bindings" },
            { value: "publish", label: "Publish" },
          ]}
        />
        <Button variant="ghost" onClick={() => openOn(connectionId, { kind: "topology", vhost, focus: name })}>
          <Waypoints />
          Show in topology
        </Button>
        {!readOnly && (
          <Button onClick={() => openDialog("create-binding", { connectionId, vhost, name, data: { source: name } })}>
            <Link2 />
            Add binding
          </Button>
        )}
        {!readOnly && !isSystem(name) && (
          <ActionMenuButton
            label="More"
            align="end"
            entries={() => [
              {
                label: "Delete exchange",
                icon: Trash2,
                danger: true,
                onSelect: () => openDialog("delete-exchange", { connectionId, vhost, name }),
              },
            ]}
          />
        )}
      </ViewToolbar>
      <Metrics
        items={[
          { label: "Publish in", value: rate(stats?.publish_in_details?.rate ?? 0), detail: "messages arriving" },
          { label: "Publish out", value: rate(stats?.publish_out_details?.rate ?? 0), detail: "messages routed on" },
          {
            label: "Bindings out",
            value: outgoing.data?.length ?? "…",
            detail: "this exchange to destinations",
            onClick: () => setView("bindings"),
          },
          {
            label: "Bindings in",
            value: name === "" ? "n/a" : (incoming.data?.length ?? "…"),
            detail: "sources to this exchange",
            onClick: () => setView("bindings"),
          },
        ]}
      />

      {view === "overview" && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SectionHeader>Message rates, last 10 minutes</SectionHeader>
          <div className="px-3 pb-3">
            <TimeSeriesChart series={series} height={140} format={rate} label="Publish in and out rates, last 10 minutes" />
          </div>
          <SectionHeader>Properties</SectionHeader>
          <KeyValues
            rows={[
              ["vhost", vhost],
              ["type", e.type],
              ["durable", String(e.durable)],
              ["auto_delete", String(e.auto_delete)],
              ["internal", String(e.internal)],
              ["policy", e.policy ?? <Dash />],
            ]}
          />
          <SectionHeader>Arguments</SectionHeader>
          <div className="px-3 py-2">
            {custom ? <TypedTree value={e.arguments} open={1} /> : <div className="text-sm text-fg-3">No arguments.</div>}
          </div>
        </div>
      )}

      {view === "bindings" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <SectionHeader>
            {`This exchange → destinations (${outgoing.data?.length ?? 0})`}
          </SectionHeader>
          <div className="flex min-h-0 flex-1 basis-1/2 flex-col">
            {outgoing.error && !outgoing.data ? (
              <ErrorState error={outgoing.error} onRetry={() => void outgoing.refresh()} />
            ) : (
              <DataTable
                rows={outgoing.data ?? []}
                columns={columns}
                rowKey={bindingKey}
                aria-label="Bindings from this exchange"
                empty="No bindings: messages published here are dropped."
              />
            )}
          </div>
          <SectionHeader>{`Sources → this exchange (${incoming.data?.length ?? 0})`}</SectionHeader>
          <div className="flex min-h-0 flex-1 basis-1/2 flex-col">
            {incoming.error && !incoming.data ? (
              <ErrorState error={incoming.error} onRetry={() => void incoming.refresh()} />
            ) : (
              <DataTable
                rows={incoming.data ?? []}
                columns={inColumns}
                rowKey={bindingKey}
                aria-label="Bindings into this exchange"
                empty="No exchange is bound to this one."
              />
            )}
          </div>
        </div>
      )}

      {view === "publish" && !outgoing.data && !outgoing.error && <Loading />}
      {view === "publish" && (outgoing.data || outgoing.error) && (
        <PublishForm
          connectionId={connectionId}
          vhost={vhost}
          exchange={name}
          routingKey={exampleKey(outgoing.data, e.type)}
          onPublished={() => invalidate(key)}
        />
      )}
    </div>
  );
}

/** A routing key that reaches the first binding: a concrete one for topic wildcards. */
function exampleKey(bindings: Binding[] | undefined, type: string): string {
  const k = bindings?.[0]?.routing_key ?? "";
  return type === "topic" ? k.replace(/[#*]/g, "test") : k;
}

function bindingColumns({
  side,
  readOnly,
  open,
  unbind,
}: {
  side: "out" | "in";
  readOnly: boolean;
  open: (type: "queue" | "exchange", name: string) => void;
  unbind: (b: Binding) => void;
}): Column<Binding>[] {
  const target = (b: Binding) => (side === "out" ? b.destination : b.source);
  const targetType = (b: Binding): "queue" | "exchange" => (side === "out" ? b.destination_type : "exchange");
  const cols: Column<Binding>[] = [
    {
      id: "target",
      header: side === "out" ? "destination" : "source",
      width: "34%",
      sortValue: target,
      cell: (b) =>
        side === "in" && b.source === "" ? (
          <span className="text-fg-3">(default)</span>
        ) : (
          <button
            type="button"
            className="max-w-full truncate text-accent-text hover:underline"
            title={`Open ${targetType(b)} ${target(b)}`}
            onClick={() => open(targetType(b), target(b))}
          >
            {target(b)}
          </button>
        ),
    },
    { id: "type", header: "type", width: 80, sortValue: (b) => targetType(b), cell: (b) => targetType(b) },
    {
      id: "routing_key",
      header: "routing_key",
      width: "24%",
      sortValue: (b) => b.routing_key,
      cell: (b) => (b.routing_key === "" ? <span className="text-fg-3">""</span> : b.routing_key),
    },
    {
      id: "arguments",
      header: "arguments",
      sortValue: (b) => argsText(b.arguments),
      cell: (b) => argsText(b.arguments) || <span className="text-fg-3">{"{}"}</span>,
    },
  ];
  if (!readOnly)
    cols.push({
      id: "actions",
      header: "",
      width: 72,
      mono: false,
      align: "right",
      cell: (b) =>
        b.source === "" ? null : (
          <button
            type="button"
            className="text-sm text-danger hover:underline"
            onClick={(ev) => {
              ev.stopPropagation();
              unbind(b);
            }}
          >
            Unbind
          </button>
        ),
    });
  return cols;
}
