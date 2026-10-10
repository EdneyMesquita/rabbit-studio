import { Layers } from "lucide-react";
import type { ReactNode } from "react";
import type { Tab } from "../../store/sessionsStore";
import { adminLabel, exchangeLabel, tabIcon } from "../tabs/tabName";

interface CrumbProps {
  icon: ReactNode;
  children: ReactNode;
  mono?: boolean;
  /** The current place, in text color. */
  last?: boolean;
}

function Crumb({ icon, children, mono, last }: CrumbProps) {
  return (
    <>
      <span aria-hidden className="text-fg-3">
        /
      </span>
      <span
        className={`flex min-w-0 items-center gap-1.5 px-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0 ${
          last ? "text-fg" : "text-fg-2"
        }`}
        aria-current={last ? "location" : undefined}
      >
        {icon}
        <span className={`truncate ${mono ? "font-data" : ""}`}>{children}</span>
      </span>
    </>
  );
}

const KIND_CRUMB: Partial<Record<Tab["kind"], string>> = {
  overview: "Overview",
  topology: "Topology",
  nodes: "Nodes",
  connections: "Connections",
  channels: "Channels",
  queues: "Queues",
  exchanges: "Exchanges",
  streams: "Streams",
};

/** Where the active tab is, after its cluster: vhost / object, or the view's name. */
export function Breadcrumb({ tab }: { tab: Tab }) {
  if (tab.kind === "global") return null;
  const Icon = tabIcon(tab);
  const object = tab.kind === "queue" || tab.kind === "exchange";
  const label = object
    ? tab.kind === "exchange"
      ? exchangeLabel(tab.name ?? "")
      : (tab.name ?? "")
    : tab.kind === "admin"
      ? adminLabel(tab.section)
      : KIND_CRUMB[tab.kind];
  return (
    <nav aria-label="Location" className="flex min-w-0 items-center gap-0.5 whitespace-nowrap max-[960px]:hidden">
      {tab.vhost !== null && (
        <Crumb icon={<Layers />} mono>
          {tab.vhost}
        </Crumb>
      )}
      <Crumb icon={<Icon />} mono={object} last>
        {label}
      </Crumb>
    </nav>
  );
}
