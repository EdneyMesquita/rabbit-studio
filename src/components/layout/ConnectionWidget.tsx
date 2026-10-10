import { ChevronDown, LayoutGrid, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionChip } from "@/components/ui/ConnectionChip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { connectionColor } from "../../lib/connectionColor";
import { openOn } from "../../lib/rabbit/nav";
import { useConnectionsStore } from "../../store/connectionsStore";
import { useUiStore } from "../../store/uiStore";
import { ENVIRONMENTS } from "../../types/connection";
import { jumpTo, OpenConnectionsItems } from "./OpenConnectionsMenu";
import type { ActiveConnection } from "./useActiveConnection";

/** Connects if needed, then shows the connection: its last tab or its overview. */
export async function goToConnection(id: string) {
  const store = useConnectionsStore.getState();
  if (!store.sessions[id]) {
    await store.connect(id);
    if (!useConnectionsStore.getState().sessions[id]) return;
  }
  jumpTo(id);
}

/**
 * The toolbar's connection switcher: the active tab's cluster, and a menu
 * of every saved one to switch to, the open ones to disconnect, and the
 * global view.
 */
export function ConnectionWidget({ active }: { active: ActiveConnection | null }) {
  const profiles = useConnectionsStore((s) => s.profiles);
  const sessions = useConnectionsStore((s) => s.sessions);
  const setConnectionDialog = useUiStore((s) => s.setConnectionDialog);
  const connected = Object.keys(sessions).length;
  const envLabel = (env: string) => ENVIRONMENTS.find((e) => e.id === env)?.label.toLowerCase() ?? env;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="min-w-0 px-2 font-medium text-fg">
          {active?.connection ? (
            <>
              <ConnectionChip name={active.connection.name} color={active.color} size="md" />
              <span className="truncate">{active.connection.name}</span>
            </>
          ) : active ? (
            <>
              <LayoutGrid className="size-3.5 text-fg-2" />
              All clusters
            </>
          ) : (
            <span className="font-normal text-fg-2">{connected > 0 ? `${connected} connected` : "No connection"}</span>
          )}
          <ChevronDown className="size-3 text-fg-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {profiles.length > 0 && <DropdownMenuLabel>Switch connection</DropdownMenuLabel>}
        {profiles.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => void goToConnection(p.id)}>
            <ConnectionChip name={p.name} color={connectionColor(p.id, p.color)} />
            <span className="truncate">{p.name}</span>
            <span className="ml-1.5 text-xs text-fg-3">{envLabel(p.environment)}</span>
            {sessions[p.id] && <span className="ml-auto size-1.5 rounded-full bg-ok" aria-label="Connected" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => openOn(null, { kind: "global" })}>
          <LayoutGrid />
          All clusters
        </DropdownMenuItem>
        {connected > 0 && (
          <>
            <DropdownMenuSeparator />
            <OpenConnectionsItems activeId={active?.connection?.id ?? null} />
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setConnectionDialog({ mode: "new" })}>
          <Plus />
          New connection…
          <DropdownMenuShortcut>Ctrl N</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
