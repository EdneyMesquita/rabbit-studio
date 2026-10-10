import { memo, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { Folder, FolderOpen, Inbox, Layers, Split, Waves } from "lucide-react";
import { RowContextMenu } from "@/components/common/ActionMenu";
import { compact } from "@/lib/rabbit/format";
import { cn } from "@/lib/utils";
import { openOn } from "../../lib/rabbit/nav";
import { groupNode, isOpen, useExplorerStore, vhostNode, type ObjectGroup } from "../../store/explorerStore";
import { RowMenuButton } from "./RowMenuButton";
import {
  isSystemExchange,
  queueTone,
  useIsActiveTab,
  useTreeExchanges,
  useTreeQueues,
  TREE_PAGE,
  type TreeExchange,
  type TreeQueue,
} from "./treeData";
import { exchangeMenuEntries, queueMenuEntries, vhostMenuEntries } from "./treeMenus";
import { TreeNote } from "./TreeNote";
import { TreeRow } from "./TreeRow";
import { useWindowedRows } from "./useWindowedRows";

interface VhostRowProps {
  cid: string;
  vhost: string;
  messages: number | undefined;
  depth: number;
  /** The Explorer is on screen. */
  shown: boolean;
}

/** A vhost and its Exchanges / Queues / Streams folders. */
export const VhostRow = memo(function VhostRow({ cid, vhost, messages, depth, shown }: VhostRowProps) {
  const id = vhostNode(cid, vhost);
  const open = useExplorerStore((s) => isOpen(s.open, id));
  const toggle = useExplorerStore((s) => s.toggle);
  const entries = () => vhostMenuEntries(cid, vhost);
  return (
    <>
      <RowContextMenu entries={entries}>
        <TreeRow
          depth={depth}
          expanded={open}
          icon={<Layers className="size-3.5 shrink-0 text-fg-2" aria-hidden />}
          label={vhost}
          labelClassName="font-data"
          title={`Virtual host ${vhost}`}
          trailing={
            <>
              {messages !== undefined && messages > 0 && <span className="tabular-nums" title={`${messages.toLocaleString("en")} messages`}>{compact(messages)}</span>}
              <RowMenuButton entries={entries} label={`Actions for vhost ${vhost}`} />
            </>
          }
          onActivate={() => toggle(id)}
        />
      </RowContextMenu>
      {open && (
        <div role="group">
          <ExchangeFolder cid={cid} vhost={vhost} depth={depth + 1} shown={shown} />
          <QueueFolders cid={cid} vhost={vhost} depth={depth + 1} shown={shown} />
        </div>
      )}
    </>
  );
});

interface FolderProps {
  cid: string;
  vhost: string;
  depth: number;
  shown: boolean;
}

function useFolderOpen(cid: string, vhost: string, group: ObjectGroup) {
  const id = groupNode(cid, vhost, group);
  const open = useExplorerStore((s) => isOpen(s.open, id));
  return { id, open };
}

function ExchangeFolder({ cid, vhost, depth, shown }: FolderProps) {
  const { id, open } = useFolderOpen(cid, vhost, "exchanges");
  const { data, error } = useTreeExchanges(cid, vhost, shown && open);
  const items = useMemo(() => (data?.items ?? []).filter((e) => !isSystemExchange(e.name)), [data]);
  return (
    <GroupRows
      cid={cid}
      vhost={vhost}
      group="exchanges"
      label="Exchanges"
      nodeId={id}
      open={open}
      depth={depth}
      items={data ? items : null}
      more={data && data.filtered_count > TREE_PAGE ? data.filtered_count : 0}
      error={error}
      renderItem={(e: TreeExchange) => <ExchangeItem key={e.name} cid={cid} vhost={vhost} exchange={e} depth={depth + 1} />}
    />
  );
}

/** Queues and Streams share one fetch, split by type. */
function QueueFolders({ cid, vhost, depth, shown }: FolderProps) {
  const queues = useFolderOpen(cid, vhost, "queues");
  const streams = useFolderOpen(cid, vhost, "streams");
  const { data, error } = useTreeQueues(cid, vhost, shown && (queues.open || streams.open));
  const [classic, stream] = useMemo(() => {
    const all = data?.items ?? [];
    return [all.filter((q) => q.type !== "stream"), all.filter((q) => q.type === "stream")];
  }, [data]);
  const more = data && data.filtered_count > TREE_PAGE ? data.filtered_count : 0;
  return (
    <>
      <GroupRows
        cid={cid}
        vhost={vhost}
        group="queues"
        label="Queues"
        nodeId={queues.id}
        open={queues.open}
        depth={depth}
        items={data ? classic : null}
        more={more}
        error={error}
        renderItem={(q: TreeQueue) => <QueueItem key={q.name} cid={cid} vhost={vhost} queue={q} depth={depth + 1} />}
      />
      <GroupRows
        cid={cid}
        vhost={vhost}
        group="streams"
        label="Streams"
        nodeId={streams.id}
        open={streams.open}
        depth={depth}
        items={data ? stream : null}
        more={0}
        error={error}
        renderItem={(q: TreeQueue) => <QueueItem key={q.name} cid={cid} vhost={vhost} queue={q} depth={depth + 1} />}
      />
    </>
  );
}

interface GroupRowsProps<T> {
  cid: string;
  vhost: string;
  group: ObjectGroup;
  label: string;
  nodeId: string;
  open: boolean;
  depth: number;
  /** null until the first answer. */
  items: T[] | null;
  /** The whole count when the folder lists only the first page. */
  more: number;
  error: string | null;
  renderItem: (item: T) => ReactNode;
}

/**
 * An object folder: its label opens the list tab (and the folder), the
 * chevron only opens or closes it. Long lists are windowed, so thousands
 * of queues cost a screenful of rows.
 */
function GroupRows<T>({ cid, vhost, group, label, nodeId, open, depth, items, more, error, renderItem }: GroupRowsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const rows = useWindowedRows(listRef, open && items ? items.length : 0);
  const toggle = useExplorerStore((s) => s.toggle);
  const setOpen = useExplorerStore((s) => s.setOpen);
  const selected = useIsActiveTab(cid, { kind: group, vhost });
  const Icon = open ? FolderOpen : Folder;
  return (
    <>
      <TreeRow
        depth={depth}
        expanded={open}
        selected={selected}
        icon={<Icon className="size-3.5 shrink-0 text-fg-2" aria-hidden />}
        label={label}
        title={`Open ${label.toLowerCase()} of ${vhost}`}
        trailing={items && <span className="tabular-nums">{more ? `${TREE_PAGE}+` : items.length}</span>}
        onToggle={() => toggle(nodeId)}
        onActivate={() => {
          openOn(cid, { kind: group, vhost });
          setOpen(nodeId, true);
        }}
      />
      {open && (
        <div role="group" ref={listRef}>
          {error && !items ? (
            <TreeNote depth={depth + 1} tone="danger">
              {error}
            </TreeNote>
          ) : !items ? (
            <TreeNote depth={depth + 1}>Loading…</TreeNote>
          ) : items.length === 0 ? (
            <TreeNote depth={depth + 1}>None</TreeNote>
          ) : null}
          {rows.padTop > 0 && <div aria-hidden style={{ height: rows.padTop }} />}
          {items?.slice(rows.start, rows.end).map(renderItem)}
          {rows.padBottom > 0 && <div aria-hidden style={{ height: rows.padBottom }} />}
          {more > 0 && (
            <TreeNote depth={depth + 1}>
              First {TREE_PAGE} of {more.toLocaleString("en")}; open the list for all
            </TreeNote>
          )}
        </div>
      )}
    </>
  );
}

const QueueItem = memo(function QueueItem({ cid, vhost, queue, depth }: { cid: string; vhost: string; queue: TreeQueue; depth: number }) {
  const selected = useIsActiveTab(cid, { kind: "queue", vhost, name: queue.name });
  const stream = queue.type === "stream";
  const tone = queueTone(queue, vhost);
  const depthCount = stream ? queue.messages : (queue.messages_ready ?? queue.messages);
  const entries = () => queueMenuEntries(cid, vhost, queue.name, stream);
  const Icon = stream ? Waves : Inbox;
  return (
    <RowContextMenu entries={entries}>
      <TreeRow
        depth={depth}
        selected={selected}
        icon={<Icon className="size-3.5 shrink-0 text-fg-2" aria-hidden />}
        label={queue.name}
        labelClassName="font-data"
        title={`${queue.name}\n${queue.type ?? "classic"} · ${(queue.messages ?? 0).toLocaleString("en")} messages · ${queue.consumers ?? 0} consumers`}
        trailing={
          <span
            className={cn("tabular-nums", tone === "hot" && "text-danger", tone === "warm" && "text-warn")}
            title={tone ? "See the Problems panel" : undefined}
          >
            {compact(depthCount ?? 0)}
          </span>
        }
        onActivate={() => openOn(cid, { kind: "queue", vhost, name: queue.name })}
      />
    </RowContextMenu>
  );
});

const ExchangeItem = memo(function ExchangeItem({ cid, vhost, exchange, depth }: { cid: string; vhost: string; exchange: TreeExchange; depth: number }) {
  const selected = useIsActiveTab(cid, { kind: "exchange", vhost, name: exchange.name });
  const entries = () => exchangeMenuEntries(cid, vhost, exchange.name);
  return (
    <RowContextMenu entries={entries}>
      <TreeRow
        depth={depth}
        selected={selected}
        icon={<Split className="size-3.5 shrink-0 text-fg-2" aria-hidden />}
        label={exchange.name}
        labelClassName="font-data"
        trailing={<span>{exchange.type}</span>}
        onActivate={() => openOn(cid, { kind: "exchange", vhost, name: exchange.name })}
      />
    </RowContextMenu>
  );
});
