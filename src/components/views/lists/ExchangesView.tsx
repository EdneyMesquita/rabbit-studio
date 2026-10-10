import { EmptyState } from "@/components/data/parts";
import type { ViewProps } from "../types";

/** Placeholder until this view is built. */
export default function ExchangesView({ tab }: ViewProps) {
  return <EmptyState title="ExchangesView">{tab.kind}</EmptyState>;
}
