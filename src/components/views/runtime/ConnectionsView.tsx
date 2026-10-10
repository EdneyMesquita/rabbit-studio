import { EmptyState } from "@/components/data/parts";
import type { ViewProps } from "../types";

/** Placeholder until this view is built. */
export default function ConnectionsView({ tab }: ViewProps) {
  return <EmptyState title="ConnectionsView">{tab.kind}</EmptyState>;
}
