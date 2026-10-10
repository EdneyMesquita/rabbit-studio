import { Activity, Cpu, Inbox, Layers, Loader2, Plug, Radio, Split, Waves, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { ConnectionChip } from "@/components/ui/ConnectionChip";
import { compact } from "@/lib/rabbit/format";
import { connectionColor, WORKSPACE_COLOR } from "../../lib/connectionColor";
import { openOn } from "../../lib/rabbit/nav";
import { useConnectionsStore } from "../../store/connectionsStore";
import { ADMIN_SECTIONS, useSessionsStore, type TabSpec } from "../../store/sessionsStore";
import { ENVIRONMENTS } from "../../types/connection";
import { goToConnection } from "../layout/ConnectionWidget";
import { recentTabIds } from "../layout/lastTabs";
import { adminIcon, tabIcon, tabName, tabWhere } from "../tabs/tabName";
import { useEditorLayoutStore } from "../../store/editorLayoutStore";
import { HighlightMatch } from "./HighlightMatch";
import type { FoundObject } from "./useBrokerSearch";

interface GroupProps {
  search: string;
  /** Closes the palette, then runs the choice. */
  run: (action: () => void) => void;
}

/** Results rendered per kind; the search itself is narrower on the server. */
const SHOWN = 40;

const PLACES: { label: string; icon: LucideIcon; spec: Omit<TabSpec, "connection"> }[] = [
  { label: "Overview", icon: Activity, spec: { kind: "overview" } },
  { label: "Topology", icon: Workflow, spec: { kind: "topology" } },
  { label: "Nodes", icon: Cpu, spec: { kind: "nodes" } },
  { label: "Connections", icon: Plug, spec: { kind: "connections" } },
  { label: "Channels", icon: Radio, spec: { kind: "channels" } },
  { label: "Queues", icon: Inbox, spec: { kind: "queues" } },
  { label: "Exchanges", icon: Split, spec: { kind: "exchanges" } },
  ...ADMIN_SECTIONS.map((s) => ({ label: `Admin: ${s.label}`, icon: adminIcon(s.id), spec: { kind: "admin" as const, section: s.id } })),
];

/** Open tabs, the most recently used first. */
export function PaletteTabs({ search, run }: GroupProps) {
  const tabs = useSessionsStore((s) => s.tabs);
  const activeTabId = useSessionsStore((s) => s.activeTabId);
  const ordered = useMemo(() => {
    const byId = new Map(tabs.map((t) => [t.id, t]));
    return recentTabIds()
      .filter((id) => id !== activeTabId)
      .map((id) => byId.get(id)!)
      .filter(Boolean);
    // recentTabIds reads the order as of now; tabs and activeTabId say when it changed
  }, [tabs, activeTabId]);
  const profiles = useConnectionsStore((s) => s.profiles);
  if (ordered.length === 0) return null;
  return (
    <CommandGroup heading="Recent tabs">
      {ordered.slice(0, search.trim() ? SHOWN : 6).map((t) => {
        const Icon = tabIcon(t);
        const name = tabName(t);
        const p = t.connection ? profiles.find((x) => x.id === t.connection!.id) : undefined;
        return (
          <CommandItem
            key={t.id}
            value={`tab:${t.id}`}
            keywords={[name, tabWhere(t), t.vhost ?? ""]}
            onSelect={() => run(() => useEditorLayoutStore.getState().showTab(t.id))}
          >
            <Icon />
            <span className="min-w-0 truncate">
              <HighlightMatch text={name} query={search} />
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-3 text-sm text-fg-3">
              <ConnectionChip name={tabWhere(t)} color={p ? connectionColor(p.id, p.color) : WORKSPACE_COLOR} size="dot" />
              {tabWhere(t)}
            </span>
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}

/** Every saved connection: go to it, connecting first when needed. */
export function PaletteConnections({ search, run }: GroupProps) {
  const profiles = useConnectionsStore((s) => s.profiles);
  const sessions = useConnectionsStore((s) => s.sessions);
  if (profiles.length === 0) return null;
  return (
    <CommandGroup heading="Connections">
      {profiles.map((p) => {
        const env = ENVIRONMENTS.find((e) => e.id === p.environment)?.label ?? "";
        return (
          <CommandItem key={p.id} value={`conn:${p.id}`} keywords={[p.name, env, p.summary]} onSelect={() => run(() => void goToConnection(p.id))}>
            <ConnectionChip name={p.name} color={connectionColor(p.id, p.color)} />
            <span className="min-w-0 truncate">
              <HighlightMatch text={p.name} query={search} />
            </span>
            <span className="ml-auto shrink-0 pl-3 text-sm text-fg-3">
              {sessions[p.id] ? env : `${env} · connect`}
            </span>
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}

/** Views of each connected cluster ("Admin: Users"...), offered once something is typed. */
export function PalettePlaces({ search, run }: GroupProps) {
  const profiles = useConnectionsStore((s) => s.profiles);
  const sessions = useConnectionsStore((s) => s.sessions);
  const connected = profiles.filter((p) => sessions[p.id]);
  if (!search.trim() || connected.length === 0) return null;
  return (
    <CommandGroup heading="Go to">
      {connected.flatMap((p) =>
        PLACES.map((place) => {
          const Icon = place.icon;
          return (
            <CommandItem
              key={`${p.id}:${place.label}`}
              value={`place:${p.id}:${place.label}`}
              keywords={[place.label, p.name]}
              onSelect={() => run(() => openOn(p.id, place.spec))}
            >
              <Icon />
              <span className="min-w-0 truncate">
                <HighlightMatch text={place.label} query={search} />
              </span>
              <span className="ml-auto shrink-0 pl-3 text-sm text-fg-3">{p.name}</span>
            </CommandItem>
          );
        }),
      )}
    </CommandGroup>
  );
}

/** Vhosts, queues and exchanges found on the connected clusters. */
export function PaletteObjects({ search, run, found, loading }: GroupProps & { found: FoundObject[]; loading: boolean }) {
  const profiles = useConnectionsStore((s) => s.profiles);
  const byId = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const groups: { heading: string; items: FoundObject[] }[] = [
    { heading: "Vhosts", items: found.filter((f) => f.kind === "vhost") },
    { heading: "Queues", items: found.filter((f) => f.kind === "queue") },
    { heading: "Exchanges", items: found.filter((f) => f.kind === "exchange") },
  ];
  return (
    <>
      {groups.map((g) =>
        g.items.length === 0 ? null : (
          <CommandGroup key={g.heading} heading={g.heading}>
            {g.items.slice(0, SHOWN).map((f) => {
              const p = byId.get(f.cid);
              const where = p?.name ?? "";
              const Icon = f.kind === "vhost" ? Layers : f.kind === "exchange" ? Split : f.type === "stream" ? Waves : Inbox;
              const label = f.kind === "vhost" ? `Queues · ${f.name}` : f.name;
              const open = () =>
                f.kind === "vhost" ? openOn(f.cid, { kind: "queues", vhost: f.vhost }) : openOn(f.cid, { kind: f.kind, vhost: f.vhost, name: f.name });
              return (
                <CommandItem
                  key={`${f.cid}:${f.kind}:${f.vhost}:${f.name}`}
                  value={`obj:${f.cid}:${f.kind}:${f.vhost}:${f.name}`}
                  keywords={[f.name, f.vhost, where]}
                  onSelect={() => run(open)}
                >
                  <Icon />
                  <span className="min-w-0 truncate font-data">
                    <HighlightMatch text={label} query={search} />
                  </span>
                  {f.kind === "queue" && f.messages !== undefined && (
                    <span className="shrink-0 text-xs text-fg-3 tabular-nums">{compact(f.messages)}</span>
                  )}
                  <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-3 text-sm text-fg-3">
                    {f.kind !== "vhost" && <span className="font-data">{f.vhost}</span>}
                    {p && <ConnectionChip name={p.name} color={connectionColor(p.id, p.color)} size="dot" />}
                    {where}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ),
      )}
      {loading && (
        <div className="flex items-center gap-2 px-2.5 py-2 text-sm text-fg-3" role="status">
          <Loader2 className="size-3.5 animate-spin" />
          Searching connected clusters…
        </div>
      )}
    </>
  );
}
