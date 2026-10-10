import { EmptyState } from "@/components/data/parts";
import type { ViewProps } from "../types";

/** Placeholder until this view is built. */
export default function NodesView({ tab }: ViewProps) {
  return <EmptyState title="NodesView">{tab.kind}</EmptyState>;
}
