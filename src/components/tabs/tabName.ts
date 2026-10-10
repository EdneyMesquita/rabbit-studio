import {
  Activity,
  ArrowLeftRight,
  Cpu,
  FileBraces,
  Flag,
  Gauge,
  Globe,
  Inbox,
  Layers,
  LayoutGrid,
  Plug,
  Radio,
  Shield,
  Split,
  Users,
  Waves,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ADMIN_SECTIONS, type AdminSection, type Tab, type TabKind } from "../../store/sessionsStore";

/** The default exchange has no name; the API and the official UI call it this. */
export function exchangeLabel(name: string): string {
  return name === "" ? "(AMQP default)" : name;
}

export function adminLabel(section: AdminSection | null): string {
  return ADMIN_SECTIONS.find((s) => s.id === section)?.label ?? "Admin";
}

const KIND_LABEL: Record<Exclude<TabKind, "queue" | "exchange" | "admin">, string> = {
  global: "All clusters",
  overview: "Overview",
  topology: "Topology",
  nodes: "Nodes",
  connections: "Connections",
  channels: "Channels",
  queues: "Queues",
  exchanges: "Exchanges",
  streams: "Streams",
};

/** What a tab is called: the object's name, or the list and its vhost ("Queues · orders"). */
export function tabName(tab: Pick<Tab, "kind" | "vhost" | "name" | "section">): string {
  if (tab.kind === "queue") return tab.name ?? "";
  if (tab.kind === "exchange") return exchangeLabel(tab.name ?? "");
  if (tab.kind === "admin") return `Admin · ${adminLabel(tab.section)}`;
  const label = KIND_LABEL[tab.kind];
  const scoped = tab.kind === "queues" || tab.kind === "exchanges" || tab.kind === "streams" || tab.kind === "topology";
  return scoped && tab.vhost ? `${label} · ${tab.vhost}` : label;
}

const SECTION_ICON: Record<AdminSection, LucideIcon> = {
  users: Users,
  vhosts: Layers,
  policies: Shield,
  limits: Gauge,
  flags: Flag,
  federation: Globe,
  shovels: ArrowLeftRight,
  definitions: FileBraces,
};

const KIND_ICON: Record<TabKind, LucideIcon> = {
  global: LayoutGrid,
  overview: Activity,
  topology: Workflow,
  nodes: Cpu,
  connections: Plug,
  channels: Radio,
  queues: Inbox,
  exchanges: Split,
  streams: Waves,
  queue: Inbox,
  exchange: Split,
  admin: Shield,
};

export function adminIcon(section: AdminSection | null): LucideIcon {
  return section ? SECTION_ICON[section] : Shield;
}

/** The icon a tab is shown with. */
export function tabIcon(tab: Pick<Tab, "kind" | "section">): LucideIcon {
  return tab.kind === "admin" ? adminIcon(tab.section) : KIND_ICON[tab.kind];
}

/** Which connection a tab shows, as text: its name, or "Workspace" for the global view. */
export function tabWhere(tab: Tab): string {
  return tab.connection?.name ?? "Workspace";
}
