import { useMemo } from "react";
import { DataTable, type Column } from "@/components/data/DataTable";
import { Meter, Tag, type Tone } from "@/components/data/parts";
import { useLive } from "@/hooks/useLive";
import { rabbit } from "@/lib/rabbit/client";
import { bytes, duration, int } from "@/lib/rabbit/format";
import { paths, withQuery } from "@/lib/rabbit/paths";
import type { NodeInfo } from "@/types/rabbit";
import { nodeProblems } from "../problems/issues";

/** A node as the list asks for it; 4.x adds the versions. */
export type NodeRow = NodeInfo & { erlang_version?: string; rabbitmq_version?: string };

const COLUMNS =
  "name,type,running,uptime,mem_used,mem_limit,mem_alarm,disk_free,disk_free_limit,disk_free_alarm,fd_used,fd_total,sockets_used,sockets_total,proc_used,proc_total,partitions,enabled_plugins,being_drained,run_queue,processors,os_pid,erlang_version,rabbitmq_version";

/** The cluster's nodes, one poller per connection however many views show them. */
export function useNodes(connectionId: string, enabled: boolean) {
  return useLive<NodeRow[]>(`${connectionId}:nodes`, () => rabbit(connectionId).get<NodeRow[]>(withQuery(paths.nodes, { columns: COLUMNS })), {
    enabled,
  });
}

export function nodeTone(n: NodeRow): Tone {
  const p = nodeProblems(n);
  return p.some((x) => x.severity === "crit") ? "crit" : p.length ? "warn" : "ok";
}

const dot: Record<Tone, string> = { ok: "bg-ok", warn: "bg-warn", crit: "bg-danger", idle: "bg-fg-3", info: "bg-accent" };

/** The 12 x 6 health bar the Explorer and nodes use. */
export function NodeDot({ tone }: { tone: Tone }) {
  return <span aria-hidden className={`mr-2 inline-block h-1.5 w-3 rounded-[2px] align-middle ${dot[tone]}`} />;
}

const nodes: Column<NodeRow>[] = [
  {
    id: "name",
    header: "node",
    width: 230,
    sortValue: (n) => n.name,
    cell: (n) => (
      <>
        <NodeDot tone={nodeTone(n)} />
        {n.name}
      </>
    ),
  },
  { id: "type", header: "type", width: 64, sortValue: (n) => n.type, cell: (n) => <span className="text-fg-3">{n.type ?? "–"}</span> },
  {
    id: "mem",
    header: "memory",
    width: 230,
    sortValue: (n) => (n.mem_limit ? (n.mem_used ?? 0) / n.mem_limit : 0),
    cell: (n) =>
      n.running === false ? (
        <span className="text-fg-3">–</span>
      ) : (
        <>
          <Meter value={n.mem_used ?? 0} max={n.mem_limit ?? 0} tone={n.mem_alarm ? "crit" : undefined} />
          {bytes(n.mem_used)} <span className="text-fg-3">/ {bytes(n.mem_limit)}</span>
        </>
      ),
  },
  {
    id: "disk",
    header: "disk free",
    width: 190,
    sortValue: (n) => n.disk_free,
    cell: (n) => (
      <span className={n.disk_free_alarm ? "text-danger" : undefined}>
        {bytes(n.disk_free)} <span className="text-fg-3">limit {bytes(n.disk_free_limit)}</span>
      </span>
    ),
  },
  { id: "fd", header: "fds", align: "right", width: 80, sortValue: (n) => n.fd_used, cell: (n) => int(n.fd_used) },
  { id: "sockets", header: "sockets", align: "right", width: 80, sortValue: (n) => n.sockets_used, cell: (n) => int(n.sockets_used) },
  { id: "procs", header: "erlang procs", align: "right", width: 100, sortValue: (n) => n.proc_used, cell: (n) => int(n.proc_used) },
  { id: "uptime", header: "uptime", align: "right", width: 100, sortValue: (n) => n.uptime, cell: (n) => <span className="text-fg-3">{duration(n.uptime)}</span> },
  {
    id: "alarms",
    header: "alarms",
    width: 110,
    mono: false,
    cell: (n) => {
      const parts = [n.mem_alarm && "memory", n.disk_free_alarm && "disk", n.partitions?.length && "partition", n.running === false && "down"].filter(Boolean);
      return parts.length ? (
        <span className="inline-flex gap-1">
          {parts.map((p) => (
            <Tag key={String(p)} className="bg-[color-mix(in_srgb,var(--color-danger)_16%,transparent)] text-danger">
              {String(p)}
            </Tag>
          ))}
        </span>
      ) : (
        <span className="text-fg-3">none</span>
      );
    },
  },
  { id: "plugins", header: "plugins", align: "right", width: 70, sortValue: (n) => n.enabled_plugins?.length, cell: (n) => int(n.enabled_plugins?.length) },
];

export function useNodeColumns(): Column<NodeRow>[] {
  return useMemo(() => nodes, []);
}

/** The nodes table: the overview shows it small, the nodes view with an inspector. */
export function NodeTable({
  rows,
  selected,
  onSelect,
  onOpen,
  reveal,
}: {
  rows: NodeRow[];
  selected?: ReadonlySet<string>;
  onSelect?: (keys: Set<string>) => void;
  onOpen?: (n: NodeRow) => void;
  reveal?: string | null;
}) {
  const columns = useNodeColumns();
  return (
    <DataTable
      aria-label="Nodes"
      rows={rows}
      columns={columns}
      rowKey={(n) => n.name}
      selected={selected}
      onSelectionChange={onSelect}
      onOpen={onOpen}
      reveal={reveal}
      defaultSort={{ column: "name", desc: false }}
      className="flex-none overflow-x-auto"
      empty="No node answered."
    />
  );
}
