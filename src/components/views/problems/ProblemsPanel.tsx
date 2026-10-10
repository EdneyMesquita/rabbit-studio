import { useCallback, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PanelHeader } from "@/components/sidebar/PanelHeader";
import { Button } from "@/components/ui/button";
import { invalidate } from "@/hooks/useLive";
import { useConnectionsStore } from "@/store/connectionsStore";
import { ClusterProbe } from "./ClusterProbe";
import { fetchProblemInputs, type ProblemInputs } from "./inputs";
import { ClusterProblemList } from "./ProblemRows";
import { useClusterProblems, type ProblemSnapshot } from "./useClusterProblems";

/**
 * The side panel of problems across every connected cluster. It is mounted
 * only while shown, and each cluster is polled once, for the counts the
 * checks need and nothing else.
 */
export default function ProblemsPanel() {
  const profiles = useConnectionsStore((s) => s.profiles);
  const sessions = useConnectionsStore((s) => s.sessions);
  const connected = useMemo(() => profiles.filter((p) => sessions[p.id]), [profiles, sessions]);
  const [snapshots, setSnapshots] = useState<Record<string, ProblemSnapshot | undefined>>({});

  const onData = useCallback((id: string, data: ProblemInputs | undefined, error: string | null) => {
    setSnapshots((s) => (s[id]?.data === data && s[id]?.error === error ? s : { ...s, [id]: { data, error } }));
  }, []);

  const problems = useClusterProblems(connected, snapshots);
  const waiting = connected.some((p) => !snapshots[p.id]);
  const clusters = new Set(problems.map((p) => p.connectionId)).size;

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel" aria-label="Problems">
      {connected.map((p) => (
        <ClusterProbe<ProblemInputs>
          key={p.id}
          connectionId={p.id}
          liveKey={`${p.id}:problems`}
          fetcher={() => fetchProblemInputs(p.id)}
          onData={onData}
        />
      ))}
      <PanelHeader title="Problems">
        <span className="mr-1 font-mono text-xs text-fg-3 tabular-nums">{problems.length}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh problems"
          title="Refresh"
          onClick={() => connected.forEach((p) => invalidate(`${p.id}:problems`))}
        >
          <RefreshCw />
        </Button>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {connected.length === 0 ? (
          <p className="px-3 py-2.5 text-sm text-fg-3">Connect to a cluster to see what needs attention.</p>
        ) : problems.length === 0 ? (
          <p className="px-3 py-2.5 text-sm text-fg-3">{waiting ? "Checking…" : "Nothing needs attention."}</p>
        ) : (
          <ClusterProblemList items={problems} />
        )}
      </div>
      {problems.length > 0 && (
        <div className="shrink-0 border-t border-line px-3 py-1.5 text-xs text-fg-3">
          {problems.length} across {clusters} {clusters === 1 ? "cluster" : "clusters"}. Critical first, production first.
        </div>
      )}
    </div>
  );
}
