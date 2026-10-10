import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Radio } from "lucide-react";
import { DataTable, type Column, type SortState } from "@/components/data/DataTable";
import { Inspector } from "@/components/data/Inspector";
import { ErrorState, FilterField, KeyValues, Loading, Spacer, StateLabel, Tag, ViewTitle, ViewToolbar, type Tone } from "@/components/data/parts";
import type { MenuEntry } from "@/components/common/ActionMenu";
import { Button } from "@/components/ui/button";
import { int } from "@/lib/rabbit/format";
import { openOn } from "@/lib/rabbit/nav";
import { paths } from "@/lib/rabbit/paths";
import type { Channel } from "@/types/rabbit";
import { Pager, RateCell, ResultsHead, Zero, connectionIdOf, copyText, nameQuery, useDebounced, usePagedList } from "../lists/common";
import type { ViewProps } from "../types";

const COLUMNS = [
  "name",
  "number",
  "connection_details",
  "user",
  "vhost",
  "node",
  "state",
  "prefetch_count",
  "global_prefetch_count",
  "messages_unacknowledged",
  "messages_unconfirmed",
  "consumer_count",
  "confirm",
  "transactional",
  "message_stats.publish_details.rate",
  "message_stats.ack_details.rate",
  "message_stats.deliver_get_details.rate",
].join(",");

const SORT_FIELDS: Record<string, string> = {
  connection: "name",
  number: "number",
  user: "user",
  vhost: "vhost",
  state: "state",
  prefetch: "prefetch_count",
  unacked: "messages_unacknowledged",
  unconfirmed: "messages_unconfirmed",
  consumers: "consumer_count",
  publish: "message_stats.publish_details.rate",
  ack: "message_stats.ack_details.rate",
  deliver: "message_stats.deliver_get_details.rate",
};

/** Channels of internal connections (shovels, federation) have no connection name: the channel's own stands in. */
const connectionName = (ch: Channel) => ch.connection_details?.name ?? ch.name.replace(/ \(\d+\)$/, "");

const stateTone = (s?: string): Tone => (s === "running" ? "ok" : s === "flow" ? "warn" : "idle");

const mode = (ch: Channel) => (ch.confirm ? "C" : "") + (ch.transactional ? "T" : "");

const columns: Column<Channel>[] = [
  { id: "connection", header: "connection", width: 290, cell: (ch) => connectionName(ch) },
  { id: "number", header: "channel", align: "right", width: 64, cell: (ch) => ch.number },
  { id: "user", header: "user", width: 100, cell: (ch) => ch.user },
  { id: "vhost", header: "vhost", width: 110, cell: (ch) => ch.vhost },
  {
    id: "mode",
    header: "mode",
    title: "C = publisher confirms, T = transactions",
    width: 64,
    cell: (ch) => (mode(ch) ? <span className="text-json-keyword">{mode(ch)}</span> : <span className="text-fg-3">–</span>),
  },
  { id: "state", header: "state", width: 96, mono: false, cell: (ch) => <StateLabel tone={stateTone(ch.state)}>{ch.state ?? "–"}</StateLabel> },
  { id: "prefetch", header: "prefetch", align: "right", width: 82, cell: (ch) => (ch.prefetch_count ? int(ch.prefetch_count) : <span className="text-fg-3">0</span>) },
  { id: "unacked", header: "unacked", align: "right", width: 82, cell: (ch) => <Zero n={ch.messages_unacknowledged} /> },
  { id: "unconfirmed", header: "unconfirmed", align: "right", width: 100, cell: (ch) => <Zero n={ch.messages_unconfirmed} /> },
  { id: "consumers", header: "consumers", align: "right", width: 92, cell: (ch) => <Zero n={ch.consumer_count} /> },
  { id: "publish", header: "publish", align: "right", width: 82, cell: (ch) => <RateCell rate={ch.message_stats?.publish_details?.rate} /> },
  { id: "deliver", header: "deliver", align: "right", width: 82, cell: (ch) => <RateCell rate={ch.message_stats?.deliver_get_details?.rate} /> },
  { id: "ack", header: "ack", align: "right", width: 76, cell: (ch) => <RateCell rate={ch.message_stats?.ack_details?.rate} /> },
];

export default function ChannelsView({ tab, shown }: ViewProps) {
  const cid = connectionIdOf(tab);
  // Arriving from a connection: its channels, found server-side whichever page they are on.
  const [filter, setFilter] = useState(tab.focus ?? "");
  const name = useDebounced(filter);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState | null>({ column: "unacked", desc: true });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (tab.focus) setFilter(tab.focus);
  }, [tab.focus]);
  useEffect(() => setPage(1), [name]);

  const sortField = sort ? SORT_FIELDS[sort.column] : undefined;
  const { rows, info, error, fresh, refresh } = usePagedList<Channel>({
    connectionId: cid,
    scope: `channels:${tab.id}`,
    base: paths.channels,
    page,
    query: { columns: COLUMNS, ...nameQuery(name), sort: sortField, sort_reverse: sortField && sort?.desc ? true : undefined },
    enabled: shown,
  });
  const current = useMemo(() => rows.find((r) => selected.has(r.name)) ?? null, [rows, selected]);

  const toConnection = useCallback((ch: Channel) => openOn(cid, { kind: "connections", focus: connectionName(ch) }), [cid]);
  const menu = useCallback(
    (ch: Channel): MenuEntry[] => [
      { heading: ch.name },
      { label: "Show connection", shortcut: "Enter", onSelect: () => toConnection(ch) },
      { label: "Copy name", onSelect: () => copyText(ch.name) },
    ],
    [toConnection],
  );
  const onSortChange = useCallback((next: SortState | null) => {
    if (next && !SORT_FIELDS[next.column]) return;
    setSort(next);
    setPage(1);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <ViewToolbar>
        <ViewTitle icon={Radio} name="Channels" kind={tab.connection?.name} />
        <FilterField value={filter} onChange={setFilter} placeholder="Filter by connection (regex ok)" className="ml-2 w-72" />
        <Spacer />
      </ViewToolbar>
      <ResultsHead
        count={int(info.filtered)}
        noun="channels"
        scope="mode C = publisher confirms, T = transactions"
        pager={<Pager page={info.page} pageCount={info.pageCount} onPage={setPage} />}
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {error && !fresh && rows.length === 0 ? (
            <ErrorState error={error} onRetry={() => void refresh()} />
          ) : !fresh && rows.length === 0 ? (
            <Loading />
          ) : (
            <DataTable
              aria-label="Channels"
              rows={rows}
              columns={columns}
              rowKey={(ch) => ch.name}
              manualSort
              sort={sort}
              onSortChange={onSortChange}
              selected={selected}
              onSelectionChange={setSelected}
              onOpen={toConnection}
              menu={menu}
              rowTone={(ch) => (ch.state === "flow" ? "warn" : null)}
              empty={filter ? "No channel matches the filter." : "No channels are open."}
            />
          )}
        </div>
        {current && <ChannelInspector ch={current} onConnection={toConnection} />}
      </div>
    </div>
  );
}

const ChannelInspector = memo(function ChannelInspector({ ch, onConnection }: { ch: Channel; onConnection: (ch: Channel) => void }) {
  return (
    <Inspector
      label="Channel"
      title={`Channel ${ch.number}`}
      subtitle={connectionName(ch)}
      actions={
        <Button size="sm" onClick={() => onConnection(ch)}>
          Connection
        </Button>
      }
    >
      <div className="flex gap-1 px-3 pt-2">
        {ch.confirm && <Tag title="publisher confirms">C</Tag>}
        {ch.transactional && <Tag title="transactions">T</Tag>}
      </div>
      <KeyValues
        rows={[
          ["state", ch.state ?? "–"],
          ["user", ch.user],
          ["vhost", ch.vhost],
          ["node", ch.node],
          ["prefetch", int(ch.prefetch_count)],
          ["global prefetch", int(ch.global_prefetch_count)],
          ["unacked", int(ch.messages_unacknowledged)],
          ["unconfirmed", int(ch.messages_unconfirmed)],
          ["consumers", int(ch.consumer_count)],
          ["publish", <RateCell key="p" rate={ch.message_stats?.publish_details?.rate} />],
          ["deliver", <RateCell key="d" rate={ch.message_stats?.deliver_get_details?.rate} />],
          ["ack", <RateCell key="a" rate={ch.message_stats?.ack_details?.rate} />],
        ]}
      />
    </Inspector>
  );
});
