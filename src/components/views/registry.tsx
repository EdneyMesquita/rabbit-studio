import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";
import type { TabKind } from "@/store/sessionsStore";
import type { ViewProps } from "./types";

/**
 * Each tab kind's view, loaded on first use so startup only pays for the
 * shell. Every module default-exports a `(props: ViewProps) => JSX`.
 */
export const VIEWS: Record<TabKind, LazyExoticComponent<ComponentType<ViewProps>>> = {
  global: lazy(() => import("./global/GlobalView")),
  overview: lazy(() => import("./overview/ClusterOverview")),
  topology: lazy(() => import("./topology/TopologyView")),
  nodes: lazy(() => import("./runtime/NodesView")),
  connections: lazy(() => import("./runtime/ConnectionsView")),
  channels: lazy(() => import("./runtime/ChannelsView")),
  queues: lazy(() => import("./lists/QueuesView")),
  streams: lazy(() => import("./lists/QueuesView")),
  exchanges: lazy(() => import("./lists/ExchangesView")),
  queue: lazy(() => import("./queue/QueueView")),
  exchange: lazy(() => import("./exchange/ExchangeView")),
  admin: lazy(() => import("./admin/AdminView")),
};
