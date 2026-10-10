import { useMemo } from "react";
import { connectionColor } from "@/lib/connectionColor";
import type { ConnectionProfileMeta } from "@/types/connection";
import { clusterProblems, sortClusterProblems, unreachableProblem, type ClusterProblem } from "./issues";
import type { ProblemInputs } from "./inputs";

export interface ProblemSnapshot {
  data?: ProblemInputs;
  error: string | null;
}

/** Every connected cluster's problems in one list, critical and production first. */
export function useClusterProblems(profiles: ConnectionProfileMeta[], snapshots: Record<string, ProblemSnapshot | undefined>): ClusterProblem[] {
  return useMemo(() => {
    const out: ClusterProblem[] = [];
    for (const p of profiles) {
      const snap = snapshots[p.id];
      if (!snap) continue;
      const list = snap.data ? clusterProblems(snap.data) : snap.error ? [unreachableProblem(snap.error)] : [];
      for (const problem of list) {
        out.push({
          connectionId: p.id,
          cluster: p.name,
          color: connectionColor(p.id, p.color),
          production: p.environment === "production",
          problem,
        });
      }
    }
    return sortClusterProblems(out);
  }, [profiles, snapshots]);
}
