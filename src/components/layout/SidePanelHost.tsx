import { lazy, Suspense, useState } from "react";
import { Loading } from "@/components/data/parts";
import { useUiStore } from "../../store/uiStore";
import { Sidebar } from "../sidebar/Sidebar";

// Loaded the first time the panel opens.
const ProblemsPanel = lazy(() => import("../views/problems/ProblemsPanel"));

/**
 * The side panel's tool windows. The Explorer stays mounted even while
 * hidden: it loads the connection list the rest of the app reads, and keeps
 * its search and scroll. Problems mounts the first time it's shown.
 */
export function SidePanelHost() {
  const panel = useUiStore((s) => s.sidePanel);
  const [problemsShown, setProblemsShown] = useState(panel === "problems");
  if (panel === "problems" && !problemsShown) setProblemsShown(true);

  return (
    <>
      <div className={panel === "explorer" ? "h-full" : "hidden"}>
        <Sidebar />
      </div>
      {problemsShown && (
        <div className={panel === "problems" ? "flex h-full flex-col" : "hidden"}>
          <Suspense fallback={<Loading />}>
            <ProblemsPanel />
          </Suspense>
        </div>
      )}
    </>
  );
}
