import { memo } from "react";
import { AlertTriangle, CircleX } from "lucide-react";
import { ConnectionChip } from "@/components/ui/ConnectionChip";
import { cn } from "@/lib/utils";
import { openOn } from "@/lib/rabbit/nav";
import type { ClusterProblem, Problem, ProblemTarget } from "./issues";

/** Opens the tab that explains a problem. */
export function openProblem(connectionId: string, target: ProblemTarget) {
  switch (target.kind) {
    case "queue":
      openOn(connectionId, { kind: "queue", vhost: target.vhost, name: target.name, view: target.view });
      break;
    case "nodes":
      openOn(connectionId, { kind: "nodes", focus: target.focus });
      break;
    case "overview":
      openOn(connectionId, { kind: "overview" });
      break;
  }
}

function RowButton({ problem, onOpen, children }: { problem: Problem; onOpen: () => void; children: React.ReactNode }) {
  const Icon = problem.severity === "crit" ? CircleX : AlertTriangle;
  return (
    <button
      type="button"
      title={problem.detail}
      onClick={onOpen}
      className="grid w-full grid-cols-[16px_1fr] gap-x-2 gap-y-0.5 px-3 py-1.5 text-left hover:bg-row-hover"
    >
      <Icon className={cn("mt-0.5 size-4", problem.severity === "crit" ? "text-danger" : "text-warn")} aria-hidden />
      <span className="truncate text-base text-fg">{problem.title}</span>
      <span />
      <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-fg-3">{children}</span>
    </button>
  );
}

/** Problems of one cluster: title, then the object in mono. */
export const ProblemList = memo(function ProblemList({ connectionId, problems }: { connectionId: string; problems: Problem[] }) {
  return (
    <div>
      {problems.map((p) => (
        <RowButton key={p.id} problem={p} onOpen={() => openProblem(connectionId, p.target)}>
          <span className="truncate font-mono">{p.object}</span>
          <span className="truncate">{p.detail}</span>
        </RowButton>
      ))}
    </div>
  );
});

/** Problems across clusters: each names its cluster with its chip. */
export const ClusterProblemList = memo(function ClusterProblemList({ items }: { items: ClusterProblem[] }) {
  return (
    <div>
      {items.map((c) => (
        <RowButton key={`${c.connectionId}:${c.problem.id}`} problem={c.problem} onOpen={() => openProblem(c.connectionId, c.problem.target)}>
          <ConnectionChip name={c.cluster} color={c.color} size="dot" />
          <span className="shrink-0">{c.cluster} ·</span>
          <span className="truncate font-mono">{c.problem.object}</span>
          <span className="truncate">· {c.problem.detail}</span>
        </RowButton>
      ))}
    </div>
  );
});
