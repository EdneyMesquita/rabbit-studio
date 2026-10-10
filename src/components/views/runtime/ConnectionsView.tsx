import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Plug, Unplug } from "lucide-react";
import { toast } from "sonner";
import { TypedTree } from "@/components/data/TypedTree";
import { DataTable, type Column, type SortState } from "@/components/data/DataTable";
import { Inspector } from "@/components/data/Inspector";
import {
  ErrorState,
  FilterField,
  KeyValues,
  Loading,
  Notice,
  SectionHeader,
  Spacer,
  StateLabel,
  ViewTitle,
  ViewToolbar,
  type Tone,
  Dash,
} from "@/components/data/parts";
import type { MenuEntry } from "@/components/common/ActionMenu";
import { Button } from "@/components/ui/button";
import { invalidate, useLive } from "@/hooks/useLive";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { confirmDestructive, isReadOnly } from "@/lib/rabbit/guard";
import { ago, bytes, int } from "@/lib/rabbit/format";
import { openOn } from "@/lib/rabbit/nav";
import { paths, withQuery } from "@/lib/rabbit/paths";
import type { Channel, Connection } from "@/types/rabbit";
import { Pager, RateCell, ResultsHead, Zero, connectionIdOf, copyText, nameQuery, useDebounced, usePagedList } from "../lists/common";
import type { ViewProps } from "../types";

const COLUMNS = [
  "name",
  "user",
  "vhost",
  "node",
  "state",
  "protocol",
  "ssl",
  "peer_host",
  "peer_port",
  "channels",
  "connected_at",
  "user_provided_name",
  "client_properties",
  "recv_oct_details.rate",
  "send_oct_details.rate",
  "frame_max",
  "channel_max",
  "timeout",
  "auth_mechanism",
].join(",");

const SORT_FIELDS: Record<string, string> = {
  client: "user_provided_name",
  address: "name",
  user: "user",
  vhost: "vhost",
  state: "state",
  protocol: "protocol",
  channels: "channels",
  recv: "recv_oct_details.rate",
  send: "send_oct_details.rate",
  node: "node",
};

/** The name a client gave itself, else its address. */
const clientName = (c: Connection) => c.user_provided_name || c.client_properties?.connection_name || c.name;

const stateTone = (state?: string): Tone =>
  state === "running" ? "ok" : state === "blocked" || state === "blocking" ? "warn" : state === "flow" ? "warn" : "idle";

const columns: Column<Connection>[] = [
  { id: "client", header: "client", width: 260, mono: false, cell: (c) => <span className="font-data">{clientName(c)}</span> },
  { id: "address", header: "address", width: 250, cell: (c) => <span className="text-fg-3">{c.name}</span> },
  { id: "user", header: "user", width: 100, cell: (c) => c.user },
  { id: "vhost", header: "vhost", width: 110, cell: (c) => c.vhost },
  { id: "state", header: "state", width: 100, mono: false, cell: (c) => <StateLabel tone={stateTone(c.state)}>{c.state ?? <Dash />}</StateLabel> },
  { id: "protocol", header: "protocol", width: 100, cell: (c) => <span className="text-json-keyword">{c.protocol ?? <Dash />}</span> },
  { id: "tls", header: "tls", width: 54, cell: (c) => (c.ssl ? <span className="text-json-keyword">on</span> : <span className="text-fg-3">off</span>) },
  { id: "channels", header: "channels", align: "right", width: 82, cell: (c) => int(c.channels) },
  { id: "recv", header: "recv", align: "right", width: 90, cell: (c) => <Bytes rate={c.recv_oct_details?.rate} /> },
  { id: "send", header: "send", align: "right", width: 90, cell: (c) => <Bytes rate={c.send_oct_details?.rate} /> },
  {
    id: "product",
    header: "client library",
    width: 170,
    cell: (c) => <span className="text-fg-3">{[c.client_properties?.product, c.client_properties?.version].filter(Boolean).join(" ") || <Dash />}</span>,
  },
];

function Bytes({ rate }: { rate: number | undefined }) {
  return rate ? <>{bytes(rate)}/s</> : <span className="text-fg-3">0</span>;
}

export default function ConnectionsView({ tab, shown }: ViewProps) {
  const cid = connectionIdOf(tab);
  const readOnly = isReadOnly(cid);
  const [filter, setFilter] = useState(tab.focus ?? "");
  const name = useDebounced(filter);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState | null>({ column: "recv", desc: true });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  // Arriving from a queue's consumer: show that connection, whichever page it is on.
  useEffect(() => {
    if (tab.focus) setFilter(tab.focus);
  }, [tab.focus]);
  useEffect(() => setPage(1), [name]);

  const sortField = sort ? SORT_FIELDS[sort.column] : undefined;
  const { rows, info, error, fresh, refresh } = usePagedList<Connection>({
    connectionId: cid,
    scope: `connections:${tab.id}`,
    base: paths.connections,
    page,
    query: { columns: COLUMNS, ...nameQuery(name), sort: sortField, sort_reverse: sortField && sort?.desc ? true : undefined },
    enabled: shown,
  });

  const reveal = useMemo(() => (tab.focus && rows.some((c) => c.name === tab.focus) ? tab.focus : null), [tab.focus, rows]);
  const current = useMemo(() => rows.find((c) => selected.has(c.name)) ?? null, [rows, selected]);
  const blocked = useMemo(() => rows.filter((c) => c.state === "blocked" || c.state === "blocking").length, [rows]);

  const close = useCallback(
    async (cs: Connection[]) => {
      const ok = await confirmDestructive(cid, {
        title: cs.length === 1 ? "Close connection" : `Close ${cs.length} connections`,
        message:
          cs.length === 1
            ? `This closes ${clientName(cs[0])} (${cs[0].name}). Its channels and consumers go with it; well-behaved clients reconnect.`
            : `This closes ${cs.length} connections. Their channels and consumers go with them; well-behaved clients reconnect.`,
        confirmLabel: "Close connection",
      });
      if (!ok) return;
      let failed = 0;
      for (const c of cs) {
        try {
          await rabbit(cid).del(paths.connection(c.name));
        } catch (e) {
          failed++;
          toast.error(`Could not close ${clientName(c)}`, { description: errorText(e) });
        }
      }
      if (cs.length - failed) toast.success(cs.length - failed === 1 ? "Connection closed" : `${cs.length - failed} connections closed`);
      setSelected(new Set());
      invalidate(`${cid}:connections`);
    },
    [cid],
  );

  const menu = useCallback(
    (c: Connection, keys: Set<string>): MenuEntry[] => {
      if (keys.size > 1) {
        const picked = rows.filter((r) => keys.has(r.name));
        return [
          { heading: `${picked.length} connections` },
          { label: "Close connections…", danger: true, disabled: readOnly, onSelect: () => void close(picked) },
        ];
      }
      return [
        { heading: clientName(c) },
        { label: "Channels of this connection", onSelect: () => openOn(cid, { kind: "channels", focus: c.name }) },
        { label: "Copy name", onSelect: () => copyText(c.name) },
        { separator: true },
        { label: "Close connection…", danger: true, disabled: readOnly, onSelect: () => void close([c]) },
      ];
    },
    [cid, rows, readOnly, close],
  );

  const onSortChange = useCallback((next: SortState | null) => {
    if (next && !SORT_FIELDS[next.column]) return;
    setSort(next);
    setPage(1);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <ViewToolbar>
        <ViewTitle icon={Plug} name="Connections" kind={tab.connection?.name} />
        <FilterField value={filter} onChange={setFilter} placeholder="Filter by client or address (regex ok)" className="ml-2 w-72" />
        <Spacer />
      </ViewToolbar>
      {blocked > 0 && (
        <Notice tone="warn">
          <b>{blocked} blocked.</b> The broker holds their publishers back: check memory and disk alarms on the nodes.
        </Notice>
      )}
      <ResultsHead
        count={int(info.filtered)}
        noun="connections"
        scope={info.filtered !== info.total ? `of ${int(info.total)}` : undefined}
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
selectFirst
              aria-label="Connections"
              rows={rows}
              columns={columns}
              rowKey={(c) => c.name}
              multi
              manualSort
              sort={sort}
              onSortChange={onSortChange}
              selected={selected}
              onSelectionChange={setSelected}
              onOpen={(c) => openOn(cid, { kind: "channels", focus: c.name })}
              menu={menu}
              reveal={reveal}
              rowTone={(c) => (c.state === "blocked" || c.state === "blocking" ? "warn" : null)}
              empty={filter ? "No connection matches the filter." : "No client is connected."}
            />
          )}
        </div>
        {current && <ConnectionInspector cid={cid} c={current} shown={shown} readOnly={readOnly} onClose={(c) => void close([c])} />}
      </div>
    </div>
  );
}

const ConnectionInspector = memo(function ConnectionInspector({
  cid,
  c,
  shown,
  readOnly,
  onClose,
}: {
  cid: string;
  c: Connection;
  shown: boolean;
  readOnly: boolean;
  onClose: (c: Connection) => void;
}) {
  // This connection's channels: one request, only for the one inspected.
  const channels = useLive<Channel[]>(
    `${cid}:connections:channels:${c.name}`,
    () =>
      rabbit(cid).get(
        withQuery(paths.connectionChannels(c.name), {
          columns: "name,number,prefetch_count,messages_unacknowledged,consumer_count,confirm,state,message_stats.publish_details.rate,message_stats.deliver_get_details.rate",
        }),
      ),
    { enabled: shown },
  );
  const props = c.client_properties;
  return (
    <Inspector
      label="Connection"
      title={clientName(c)}
      subtitle={c.name}
      actions={
        !readOnly && (
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => onClose(c)}>
            <Unplug />
            Close
          </Button>
        )
      }
    >
      {(c.state === "blocked" || c.state === "blocking") && (
        <Notice tone="warn">Blocked by a resource alarm; it resumes when the alarm clears.</Notice>
      )}
      <KeyValues
        rows={[
          ["client", [props?.product, props?.version].filter(Boolean).join(" ") || <Dash />],
          ["platform", props?.platform ?? <Dash />],
          ["user", c.user],
          ["vhost", c.vhost],
          ["node", c.node],
          ["protocol", c.protocol ?? <Dash />],
          ["tls", c.ssl ? "yes" : "no"],
          ["auth", c.auth_mechanism ?? <Dash />],
          ["heartbeat", c.timeout != null ? `${c.timeout} s` : <Dash />],
          ["frame max", int(c.frame_max)],
          ["connected", c.connected_at ? ago(c.connected_at) : <Dash />],
          ["recv", <Bytes key="r" rate={c.recv_oct_details?.rate} />],
          ["send", <Bytes key="s" rate={c.send_oct_details?.rate} />],
        ]}
      />
      <SectionHeader actions={<span className="font-mono">{channels.data?.length ?? c.channels ?? 0}</span>}>Channels</SectionHeader>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-fg-3">
            <th className="py-1 pl-3 font-medium">#</th>
            <th className="font-medium">prefetch</th>
            <th className="font-medium">unacked</th>
            <th className="font-medium">publish</th>
            <th className="pr-3 font-medium">deliver</th>
          </tr>
        </thead>
        <tbody className="font-mono text-[12px]">
          {(channels.data ?? []).map((ch) => (
            <tr key={ch.name}>
              <td className="py-0.5 pl-3">{ch.number}</td>
              <td>{ch.prefetch_count ? int(ch.prefetch_count) : <span className="text-fg-3">0</span>}</td>
              <td><Zero n={ch.messages_unacknowledged} /></td>
              <td><RateCell rate={ch.message_stats?.publish_details?.rate} /></td>
              <td className="pr-3"><RateCell rate={ch.message_stats?.deliver_get_details?.rate} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <SectionHeader>Client properties</SectionHeader>
      <div className="px-3 py-2">
        <TypedTree value={(props ?? {}) as Record<string, unknown>} open={1} />
      </div>
    </Inspector>
  );
});
