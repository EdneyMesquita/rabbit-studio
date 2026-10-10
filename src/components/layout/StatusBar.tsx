import { Lock, Plug, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ConnectionChip } from "@/components/ui/ConnectionChip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { DEFAULT_INTERVAL, useLiveStore } from "../../hooks/useLive";
import { useConnectionsStore } from "../../store/connectionsStore";
import { exchangeLabel } from "../tabs/tabName";
import { OpenConnectionsItems } from "./OpenConnectionsMenu";
import { useActiveConnection, useConnectedCount } from "./useActiveConnection";

interface StatusItemProps {
  className?: string;
  title?: string;
  children: ReactNode;
}

function StatusItem({ className, title, children }: StatusItemProps) {
  return (
    <span title={title} className={cn("inline-flex h-[22px] items-center gap-1.5 rounded-sm px-[7px] whitespace-nowrap", className)}>
      {children}
    </span>
  );
}

const ITEM_BUTTON = "inline-flex h-[22px] items-center gap-1.5 rounded-sm px-[7px] whitespace-nowrap hover:bg-hover hover:text-fg";

/**
 * Live or paused, as a button. The dot beats once per answer from any
 * cluster: it is the one thing here that re-renders on every refresh.
 */
function LiveIndicator() {
  const paused = useLiveStore((s) => s.paused);
  const lastBeat = useLiveStore((s) => s.lastBeat);
  const seconds = DEFAULT_INTERVAL / 1000;
  // A beat is a ring that shows, then goes: two paints, no animation. On
  // WebKitGTK even a tiny keyframe animation repaints the window at 60 fps,
  // which cost more than all the polling it reports on.
  const [ring, setRing] = useState(false);
  useEffect(() => {
    if (paused || !lastBeat) return;
    setRing(true);
    const t = window.setTimeout(() => setRing(false), 700);
    return () => window.clearTimeout(t);
  }, [lastBeat, paused]);
  return (
    <button
      type="button"
      className={ITEM_BUTTON}
      title={paused ? "Live updates are paused. Click to resume." : `Views refresh every ${seconds} s. Click to pause.`}
      aria-pressed={!paused}
      onClick={() => useLiveStore.getState().setPaused(!paused)}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          paused ? "bg-fg-3/60" : "bg-ok",
          ring && !paused && "shadow-[0_0_0_2.5px_color-mix(in_srgb,var(--color-ok)_35%,transparent)]",
        )}
      />
      {paused ? "Paused" : `Live · ${seconds}s`}
    </button>
  );
}

/**
 * The 26px strip at the bottom: which cluster the active tab speaks for and
 * its versions, how many are connected (a menu to jump to or disconnect
 * them), live updates, the connection's guards; on the right, where the tab is.
 */
export function StatusBar() {
  const active = useActiveConnection();
  const connected = useConnectedCount();
  const saved = useConnectionsStore((s) => s.profiles.length);
  const tab = active?.tab;
  const session = active?.session;
  const object = tab && (tab.kind === "queue" || tab.kind === "exchange") && tab.vhost !== null;

  return (
    <footer className="flex h-[26px] shrink-0 items-center gap-0.5 overflow-hidden border-t border-seam bg-panel px-2 text-xs text-fg-2">
      {active?.connection ? (
        <StatusItem className="min-w-0">
          <ConnectionChip name={active.connection.name} color={active.color} size="dot" />
          <span className="truncate font-medium text-fg">{active.connection.name}</span>
          {session?.serverVersion && <span>RabbitMQ {session.serverVersion}</span>}
        </StatusItem>
      ) : (
        <StatusItem>
          <span className="font-medium text-fg">Workspace</span>
        </StatusItem>
      )}
      {saved > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={ITEM_BUTTON} title="Manage open connections" disabled={connected === 0}>
              <Plug className="size-3" />
              {connected} of {saved} connected
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-64">
            <OpenConnectionsItems activeId={active?.connection?.id ?? null} />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <LiveIndicator />
      {session?.readOnly && (
        <StatusItem className="text-warn" title="Nothing that changes the broker is offered on this connection">
          <Lock className="size-3" />
          Read-only
        </StatusItem>
      )}
      {active?.profile?.typedConfirmation && !session?.readOnly && (
        <StatusItem className="max-[1100px]:hidden" title="Purge, delete and the like ask for the object's name to be typed">
          <ShieldAlert className="size-3" />
          Destructive actions ask for the name
        </StatusItem>
      )}
      {session && (
        <StatusItem
          className={session.amqp ? undefined : "text-fg-3"}
          title={session.amqp ? "AMQP is on: moving, replaying and reading streams work" : "AMQP is off for this connection: moving, replaying and streams are unavailable"}
        >
          AMQP {session.amqp ? "on" : "off"}
        </StatusItem>
      )}
      <span className="flex-1" />
      {object ? (
        <StatusItem className="min-w-0">
          <span className="truncate font-data">
            {tab.vhost} / {tab.kind === "exchange" ? exchangeLabel(tab.name ?? "") : tab.name}
          </span>
        </StatusItem>
      ) : session ? (
        <>
          <StatusItem className="min-w-0">
            <span className="truncate font-data">
              {session.user}
              {session.clusterName ? `@${session.clusterName}` : ""}
            </span>
          </StatusItem>
          {session.erlangVersion && <StatusItem className="max-[960px]:hidden">Erlang {session.erlangVersion}</StatusItem>}
        </>
      ) : (
        !active?.connection && saved > 0 && <StatusItem>{saved} {saved === 1 ? "cluster" : "clusters"}</StatusItem>
      )}
    </footer>
  );
}
