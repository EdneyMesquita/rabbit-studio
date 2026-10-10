import { memo, useEffect, useMemo, useState } from "react";
import { Cpu } from "lucide-react";
import { Inspector } from "@/components/data/Inspector";
import { ErrorState, KeyValues, Loading, Notice, SectionHeader, Spacer, Tag, ViewTitle, ViewToolbar, Dash } from "@/components/data/parts";
import { useLive } from "@/hooks/useLive";
import { rabbit } from "@/lib/rabbit/client";
import { bytes, duration, int, percent } from "@/lib/rabbit/format";
import { paths, withQuery } from "@/lib/rabbit/paths";
import { nodeProblems } from "../problems/issues";
import { ProblemList } from "../problems/ProblemRows";
import { connectionIdOf, ResultsHead } from "../lists/common";
import type { ViewProps } from "../types";
import { NodeTable, nodeTone, useNodes, type NodeRow } from "./nodesData";

export default function NodesView({ tab, shown }: ViewProps) {
  const cid = connectionIdOf(tab);
  const live = useNodes(cid, shown);
  const nodes = useMemo(() => live.data ?? [], [live.data]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  // The tab's focus names a node; with none, the first that isn't well.
  const reveal = useMemo(() => {
    if (tab.focus && nodes.some((n) => n.name === tab.focus)) return tab.focus;
    return null;
  }, [tab.focus, nodes]);
  useEffect(() => {
    if (selected.size === 0 && !reveal && nodes.length) {
      const bad = nodes.find((n) => nodeTone(n) !== "ok") ?? nodes[0];
      setSelected(new Set([bad.name]));
    }
    // Once, when the first answer arrives.
  }, [nodes.length > 0]);

  const current = nodes.find((n) => selected.has(n.name)) ?? null;
  const alarms = useMemo(() => nodes.flatMap((n) => nodeProblems(n).filter((p) => p.severity === "crit")), [nodes]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <ViewToolbar>
        <ViewTitle icon={Cpu} name="Nodes" kind={tab.connection?.name} />
        <Spacer />
      </ViewToolbar>
      {alarms.map((p) => (
        <Notice key={p.id} tone="crit">
          <b className="font-mono">{p.object}</b> · {p.title}. {p.detail}.
        </Notice>
      ))}
      <ResultsHead count={int(nodes.length)} noun="nodes" scope={`${nodes.filter((n) => n.running !== false).length} running`} />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {live.error && !live.data ? (
            <ErrorState error={live.error} onRetry={() => void live.refresh()} />
          ) : !live.data ? (
            <Loading />
          ) : (
            <NodeTable rows={nodes} selected={selected} onSelect={setSelected} reveal={reveal} />
          )}
        </div>
        {current && <NodeInspector cid={cid} node={current} shown={shown} />}
      </div>
    </div>
  );
}

interface NodeDetail {
  memory?: Record<string, unknown>;
  db_dir?: string;
  os_pid?: string;
  erlang_version?: string;
  rabbitmq_version?: string;
}

const NodeInspector = memo(function NodeInspector({ cid, node, shown }: { cid: string; node: NodeRow; shown: boolean }) {
  // The memory breakdown is one node's detail: asked for only here.
  const detail = useLive<NodeDetail>(
    `${cid}:nodes:detail:${node.name}`,
    () => rabbit(cid).get(withQuery(paths.node(node.name), { memory: true, columns: "memory,db_dir,os_pid,erlang_version,rabbitmq_version" })),
    { enabled: shown && node.running !== false, interval: 15_000 },
  );
  const parts = useMemo(() => {
    const m = detail.data?.memory;
    if (!m) return [];
    return Object.entries(m)
      .filter((e): e is [string, number] => typeof e[1] === "number" && e[1] > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [detail.data]);
  const top = parts[0]?.[1] ?? 1;
  const problems = nodeProblems(node);

  return (
    <Inspector label="Node" title={node.name} subtitle={node.type ? `${node.type} node` : undefined}>
      {problems.length > 0 && <ProblemList connectionId={cid} problems={problems} />}
      <KeyValues
        rows={[
          ["state", node.running === false ? "down" : node.being_drained ? "draining" : "running"],
          ["uptime", duration(node.uptime)],
          ["rabbitmq", detail.data?.rabbitmq_version ?? node.rabbitmq_version ?? <Dash />],
          ["erlang", detail.data?.erlang_version ?? node.erlang_version ?? <Dash />],
          ["cores", int(node.processors)],
          ["run queue", int(node.run_queue)],
          ["memory", `${bytes(node.mem_used)} of ${bytes(node.mem_limit)} (${percent(node.mem_limit ? (node.mem_used ?? 0) / node.mem_limit : undefined)})`],
          ["disk free", `${bytes(node.disk_free)} (limit ${bytes(node.disk_free_limit)})`],
          ["file descriptors", `${int(node.fd_used)} / ${int(node.fd_total)}`],
          ["sockets", `${int(node.sockets_used)} / ${int(node.sockets_total)}`],
          ["erlang processes", `${int(node.proc_used)} / ${int(node.proc_total)}`],
          ["partitions", node.partitions?.length ? node.partitions.join(", ") : <Dash />],
          ["data dir", detail.data?.db_dir ?? <Dash />],
        ]}
      />
      {parts.length > 0 && (
        <>
          <SectionHeader>Memory by category</SectionHeader>
          <table className="w-full text-sm">
            <tbody>
              {parts.map(([k, v]) => (
                <tr key={k}>
                  <td className="py-0.5 pl-3 text-fg-2">{k.replace(/_/g, " ")}</td>
                  <td className="w-24 px-2">
                    <span className="block h-1 overflow-hidden rounded-xs bg-line" aria-hidden>
                      <i className="block h-full bg-s1" style={{ width: `${(v / top) * 100}%` }} />
                    </span>
                  </td>
                  <td className="py-0.5 pr-3 text-right font-mono text-[12px] tabular-nums">{bytes(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <SectionHeader actions={<span className="font-mono">{node.enabled_plugins?.length ?? 0}</span>}>Plugins</SectionHeader>
      <div className="flex flex-wrap gap-1 px-3 py-2">
        {(node.enabled_plugins ?? []).map((p) => (
          <Tag key={p}>{p}</Tag>
        ))}
        {!node.enabled_plugins?.length && <span className="text-sm text-fg-3">None reported yet.</span>}
      </div>
    </Inspector>
  );
});
