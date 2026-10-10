import { EmptyState } from "@/components/data/parts";
import type { ViewProps } from "../types";

/** Placeholder until this view is built. */
export default function QueueView({ tab }: ViewProps) {
  return <EmptyState title="QueueView">{tab.kind}</EmptyState>;
}
