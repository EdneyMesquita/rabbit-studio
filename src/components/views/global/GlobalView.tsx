import { EmptyState } from "@/components/data/parts";
import type { ViewProps } from "../types";

/** Placeholder until this view is built. */
export default function GlobalView({ tab }: ViewProps) {
  return <EmptyState title="GlobalView">{tab.kind}</EmptyState>;
}
