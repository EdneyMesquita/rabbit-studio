import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Split } from "lucide-react";
import { DataTable, type Column, type SortState } from "@/components/data/DataTable";
import { Inspector } from "@/components/data/Inspector";
import { JsonView } from "@/components/data/JsonView";
import { ErrorState, FilterField, KeyValues, Loading, SectionHeader, Spacer, Tag, ViewTitle, ViewToolbar } from "@/components/data/parts";
import type { MenuEntry } from "@/components/common/ActionMenu";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { isReadOnly } from "@/lib/rabbit/guard";
import { int } from "@/lib/rabbit/format";
import { openOn } from "@/lib/rabbit/nav";
import { paths } from "@/lib/rabbit/paths";
import { openDialog } from "@/store/dialogStore";
import type { Exchange } from "@/types/rabbit";
import type { ViewProps } from "../types";
import { Pager, RateCell, ResultsHead, connectionIdOf, copyText, nameQuery, useDebounced, usePagedList } from "./common";

const COLUMNS = [
  "name",
  "vhost",
  "type",
  "durable",
  "auto_delete",
  "internal",
  "policy",
  "arguments",
  "message_stats.publish_in_details.rate",
  "message_stats.publish_out_details.rate",
].join(",");

const SORT_FIELDS: Record<string, string> = {
  name: "name",
  vhost: "vhost",
  type: "type",
  in: "message_stats.publish_in_details.rate",
  out: "message_stats.publish_out_details.rate",
  policy: "policy",
};

/** Names the broker owns: the default exchange (empty name) and amq.*. */
const isSystem = (e: Pick<Exchange, "name">) => e.name === "" || e.name.startsWith("amq.");
/** The same rule for the server: a name that is not amq.* and not empty. */
const USER_EXCHANGES = "^(?!amq\\.).+";

const keyOf = (e: Exchange) => `${e.vhost}\u0000${e.name}`;
const label = (e: Exchange) => (e.name === "" ? "(AMQP default)" : e.name);

const COLUMN_DEFS = (allVhosts: boolean): Column<Exchange>[] => {
  const cols: Column<Exchange>[] = [
    { id: "name", header: "name", cell: (e) => (e.name === "" ? <span className="text-fg-3">(AMQP default)</span> : e.name) },
    { id: "vhost", header: "vhost", width: 130, cell: (e) => <span className="text-fg-3">{e.vhost}</span> },
    { id: "type", header: "type", width: 90, cell: (e) => <span className="text-json-keyword">{e.type}</span> },
    {
      id: "features",
      header: "features",
      width: 110,
      mono: false,
      cell: (e) => (
        <span className="inline-flex gap-[3px]">
          {e.durable && <Tag title="durable">D</Tag>}
          {e.auto_delete && <Tag title="auto-delete">AD</Tag>}
          {e.internal && <Tag title="internal: only other exchanges publish to it">Int</Tag>}
        </span>
      ),
    },
    { id: "in", header: "in", title: "Messages published into the exchange", align: "right", width: 80, cell: (e) => <RateCell rate={e.message_stats?.publish_in_details?.rate} /> },
    { id: "out", header: "out", title: "Messages routed out to queues", align: "right", width: 80, cell: (e) => <RateCell rate={e.message_stats?.publish_out_details?.rate} /> },
    { id: "policy", header: "policy", width: 160, cell: (e) => <span className="text-fg-3">{e.policy ?? ""}</span> },
  ];
  return allVhosts ? cols : cols.filter((c) => c.id !== "vhost");
};

export default function ExchangesView({ tab, shown }: ViewProps) {
  const cid = connectionIdOf(tab);
  const readOnly = isReadOnly(cid);
  const vhost = tab.vhost;

  const [filter, setFilter] = useState("");
  const typed = useDebounced(filter);
  const [showSystem, setShowSystem] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState | null>({ column: "name", desc: false });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [lastKey, setLastKey] = useState<string | null>(null);

  // With no filter typed, the server drops the system exchanges itself, so a
  // vhost with 50 built-ins doesn't spend its pages on them.
  const query = nameQuery(typed);
  const serverQuery = !showSystem && !query.name ? { name: USER_EXCHANGES, use_regex: true } : query;
  const sortField = sort ? SORT_FIELDS[sort.column] : undefined;
  const { rows, info, error, fresh, refresh } = usePagedList<Exchange>({
    connectionId: cid,
    scope: `exchanges:${tab.id}`,
    base: paths.exchanges(vhost),
    page,
    query: { columns: COLUMNS, ...serverQuery, sort: sortField, sort_reverse: sortField && sort?.desc ? true : undefined },
    enabled: shown,
  });
  const visible = useMemo(() => (showSystem ? rows : rows.filter((e) => !isSystem(e))), [rows, showSystem]);
  const columns = useMemo(() => COLUMN_DEFS(!vhost), [vhost]);
  useEffect(() => setPage(1), [typed, vhost, showSystem]);

  const reveal = useMemo(() => {
    if (!tab.focus) return null;
    const hit = rows.find((e) => e.name === tab.focus && (!vhost || e.vhost === vhost));
    return hit ? keyOf(hit) : null;
  }, [tab.focus, rows, vhost]);

  const current = useMemo(() => {
    const k = lastKey && selected.has(lastKey) ? lastKey : [...selected][0];
    return k ? visible.find((e) => keyOf(e) === k) ?? null : null;
  }, [selected, lastKey, visible]);

  const open = useCallback((e: Exchange, view?: string) => openOn(cid, { kind: "exchange", vhost: e.vhost, name: e.name, view }), [cid]);

  const menu = useCallback(
    (e: Exchange): MenuEntry[] => [
      { heading: label(e) },
      { label: "Open", shortcut: "Enter", onSelect: () => open(e) },
      { label: "Publish…", disabled: readOnly, onSelect: () => openDialog("publish", { connectionId: cid, vhost: e.vhost, data: { exchange: e.name } }) },
      { label: "Copy name", disabled: e.name === "", onSelect: () => copyText(e.name) },
      { separator: true },
      { label: "Delete exchange…", danger: true, disabled: readOnly || isSystem(e), onSelect: () => openDialog("delete-exchange", { connectionId: cid, vhost: e.vhost, name: e.name }) },
    ],
    [cid, readOnly, open],
  );

  const onSortChange = useCallback((next: SortState | null) => {
    if (next && !SORT_FIELDS[next.column]) return;
    setSort(next);
    setPage(1);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <ViewToolbar>
        <ViewTitle icon={Split} name="Exchanges" kind={vhost ? `vhost ${vhost}` : "all vhosts"} />
        <FilterField value={filter} onChange={setFilter} placeholder="Filter by name (regex ok)" className="ml-2 w-64" />
        <label className="ml-2 flex items-center gap-2 text-sm text-fg-2 select-none">
          <Switch size="sm" checked={showSystem} onCheckedChange={setShowSystem} aria-label="Show system exchanges" />
          Show system exchanges
        </label>
        <Spacer />
        {!readOnly && (
          <Button variant="primary" onClick={() => openDialog("create-exchange", { connectionId: cid, vhost })}>
            <Plus />
            New exchange
          </Button>
        )}
      </ViewToolbar>
      <ResultsHead
        count={int(showSystem || visible.length !== rows.length ? visible.length : info.filtered)}
        noun="exchanges"
        scope={vhost ? `vhost ${vhost}` : undefined}
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
              aria-label="Exchanges"
              rows={visible}
              columns={columns}
              rowKey={keyOf}
              manualSort
              sort={sort}
              onSortChange={onSortChange}
              selected={selected}
              onSelectionChange={(keys, last) => {
                setSelected(keys);
                setLastKey(last);
              }}
              onOpen={(e) => open(e)}
              menu={menu}
              reveal={reveal}
              rowTone={(e) => (isSystem(e) ? "muted" : null)}
              empty={filter ? "No exchange matches the filter." : "No exchanges here yet."}
            />
          )}
        </div>
        {current && <ExchangeInspector e={current} readOnly={readOnly} onOpen={open} cid={cid} />}
      </div>
    </div>
  );
}

const ExchangeInspector = memo(function ExchangeInspector({
  e,
  cid,
  readOnly,
  onOpen,
}: {
  e: Exchange;
  cid: string;
  readOnly: boolean;
  onOpen: (e: Exchange, view?: string) => void;
}) {
  const args = e.arguments ?? {};
  return (
    <Inspector
      label="Exchange"
      title={label(e)}
      subtitle={`${e.vhost} · ${e.type}`}
      actions={
        <Button size="sm" onClick={() => onOpen(e)}>
          Open
        </Button>
      }
    >
      <KeyValues
        rows={[
          ["type", e.type],
          ["durable", String(e.durable)],
          ["auto-delete", String(e.auto_delete)],
          ["internal", String(e.internal)],
          ["policy", e.policy ?? "–"],
          ["publish in", <RateCell key="i" rate={e.message_stats?.publish_in_details?.rate} />],
          ["publish out", <RateCell key="o" rate={e.message_stats?.publish_out_details?.rate} />],
        ]}
      />
      {Object.keys(args).length > 0 && (
        <>
          <SectionHeader>Arguments</SectionHeader>
          <div className="px-3 py-2">
            <JsonView value={args} />
          </div>
        </>
      )}
      <SectionHeader>Go to</SectionHeader>
      <div className="flex flex-wrap gap-1.5 px-3 py-2">
        <Button size="sm" variant="secondary" onClick={() => onOpen(e, "bindings")}>
          Bindings
        </Button>
        {!readOnly && (
          <Button size="sm" variant="secondary" onClick={() => openDialog("publish", { connectionId: cid, vhost: e.vhost, data: { exchange: e.name } })}>
            Publish…
          </Button>
        )}
      </div>
    </Inspector>
  );
});
