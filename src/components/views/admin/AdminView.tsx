import { EmptyState } from "@/components/data/parts";
import type { ViewProps } from "../types";

/** Placeholder until this view is built. */
export default function AdminView({ tab }: ViewProps) {
  return <EmptyState title="AdminView">{tab.kind}</EmptyState>;
}
