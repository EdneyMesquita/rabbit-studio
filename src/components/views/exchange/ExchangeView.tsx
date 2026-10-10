import { EmptyState } from "@/components/data/parts";
import type { ViewProps } from "../types";

/** Placeholder until this view is built. */
export default function ExchangeView({ tab }: ViewProps) {
  return <EmptyState title="ExchangeView">{tab.kind}</EmptyState>;
}
