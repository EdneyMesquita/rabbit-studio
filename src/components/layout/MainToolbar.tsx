import type { ReactNode } from "react";
import { Plus, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConnectionsStore } from "../../store/connectionsStore";
import { useUiStore } from "../../store/uiStore";
import { ThemeSwitcher } from "../sidebar/ThemeSwitcher";
import { AppLogo } from "./AppLogo";
import { Breadcrumb } from "./Breadcrumb";
import { ConnectionWidget } from "./ConnectionWidget";
import { SearchButton } from "./SearchButton";
import { useActiveConnection } from "./useActiveConnection";

/** Connects every saved connection not connected yet, side by side. */
export function connectAll() {
  const { profiles, sessions, connect } = useConnectionsStore.getState();
  for (const p of profiles) if (!sessions[p.id]) void connect(p.id);
}

function ToolbarIcon({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} onClick={onClick} disabled={disabled}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The 40px bar across the top: cluster and place on the left, quick open
 * in the middle, actions on the right. Its leading edge takes the active
 * connection's color, so production never looks like local.
 */
export function MainToolbar() {
  const active = useActiveConnection();
  const offline = useConnectionsStore((s) => s.profiles.filter((p) => !s.sessions[p.id] && !s.connecting[p.id]).length);
  const tint = active?.connection
    ? {
        background: `linear-gradient(90deg, color-mix(in srgb, ${active.color} 26%, var(--color-panel)) 0, var(--color-panel) 360px)`,
      }
    : undefined;

  return (
    <header
      className="grid h-10 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-seam bg-panel pr-1.5 pl-2.5"
      style={tint}
    >
      <div className="flex min-w-0 items-center gap-1">
        <AppLogo className="mr-1.5 size-[18px]" />
        <ConnectionWidget active={active} />
        {active && <Breadcrumb tab={active.tab} />}
      </div>
      <SearchButton />
      <div className="flex min-w-0 items-center justify-end gap-1">
        <ToolbarIcon label="New connection (Ctrl N)" onClick={() => useUiStore.getState().setConnectionDialog({ mode: "new" })}>
          <Plus />
        </ToolbarIcon>
        <ToolbarIcon
          label={offline > 0 ? `Connect all (${offline} not connected)` : "Every connection is connected"}
          onClick={connectAll}
          disabled={offline === 0}
        >
          <PlugZap />
        </ToolbarIcon>
        <ThemeSwitcher />
      </div>
    </header>
  );
}
