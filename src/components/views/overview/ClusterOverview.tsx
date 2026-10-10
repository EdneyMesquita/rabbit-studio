import { EmptyState } from "@/components/data/parts";
import type { ViewProps } from "../types";

/** Placeholder until this view is built. */
export default function ClusterOverview({ tab }: ViewProps) {
  return <EmptyState title="ClusterOverview">{tab.kind}</EmptyState>;
}
