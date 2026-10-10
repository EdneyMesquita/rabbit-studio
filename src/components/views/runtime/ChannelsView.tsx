import { EmptyState } from "@/components/data/parts";
import type { ViewProps } from "../types";

/** Placeholder until this view is built. */
export default function ChannelsView({ tab }: ViewProps) {
  return <EmptyState title="ChannelsView">{tab.kind}</EmptyState>;
}
