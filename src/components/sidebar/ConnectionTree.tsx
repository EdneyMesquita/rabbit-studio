import { useMemo } from "react";
import { Activity, Cpu, Folder, FolderOpen, Inbox, Layers, Loader2, Plug, Radio, Split, Waves, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { RowContextMenu } from "@/components/common/ActionMenu";
import { ConnectionChip } from "@/components/ui/ConnectionChip";
import { connectionColor } from "@/lib/connectionColor";
import { cn } from "@/lib/utils";
import { openOn } from "../../lib/rabbit/nav";
import { useConnectionsStore } from "../../store/connectionsStore";
import { folderNode, isOpen, useExplorerStore } from "../../store/explorerStore";
import { ADMIN_SECTIONS, tabKey, useSessionsStore, type TabSpec } from "../../store/sessionsStore";
import { ENVIRONMENTS, type ConnectionProfileMeta, type Environment } from "../../types/connection";
import type { FoundObject } from "../palette/useBrokerSearch";
import { adminIcon } from "../tabs/tabName";
import { ConnectionRow } from "./ConnectionRow";
import { Highlighted } from "./Highlighted";
import { RowMenuButton } from "./RowMenuButton";
import { environmentMenuEntries, exchangeMenuEntries, queueMenuEntries, vhostMenuEntries } from "./treeMenus";
import { TreeNote } from "./TreeNote";
import { TreeRow } from "./TreeRow";

/** Connections by environment, in the order of ENVIRONMENTS; empty ones are left out. */
function byEnvironment(profiles: ConnectionProfileMeta[]) {
  return ENVIRONMENTS.map((env) => ({ ...env, profiles: profiles.filter((p) => p.environment === env.id) })).filter(
    (g) => g.profiles.length > 0,
  );
}

function EnvironmentRow({ env, label, count, expanded, onToggle }: { env: Environment; label: string; count: number; expanded: boolean; onToggle?: () => void }) {
  const entries = () => environmentMenuEntries(env, label);
  const Icon = expanded ? FolderOpen : Folder;
  return (
    <RowContextMenu entries={entries}>
      <TreeRow
        depth={0}
        expanded={expanded}
        icon={<Icon className="size-3.5 shrink-0 text-fg-2" aria-hidden />}
        label={label}
        trailing={
          <>
            <span>{count}</span>
            <RowMenuButton entries={entries} label={`Actions for ${label}`} />
          </>
        }
        onActivate={onToggle}
      />
    </RowContextMenu>
  );
}

/** The tree as it is: environment folders, connections, and what's under them. */
export function ConnectionTree({ shown }: { shown: boolean }) {
  const profiles = useConnectionsStore((s) => s.profiles);
  const open = useExplorerStore((s) => s.open);
  const toggle = useExplorerStore((s) => s.toggle);
  const groups = useMemo(() => byEnvironment(profiles), [profiles]);

  return (
    <>
      {groups.map((g) => {
        const expanded = isOpen(open, folderNode(g.id));
        return (
          <div key={g.id} role="group">
            <EnvironmentRow env={g.id} label={g.label} count={g.profiles.length} expanded={expanded} onToggle={() => toggle(folderNode(g.id))} />
            {expanded && g.profiles.map((p) => <ConnectionRow key={p.id} profile={p} depth={1} query="" shown={shown} />)}
          </div>
        );
      })}
    </>
  );
}

/** One row of the search results. */
interface SearchRow {
  key: string;
  depth: number;
  label: string;
  icon?: LucideIcon;
  profile?: ConnectionProfileMeta;
  mono?: boolean;
  trailing?: string;
  cid?: string;
  /** The tab it opens, for highlighting it. */
  spec?: Omit<TabSpec, "connection">;
  found?: FoundObject;
  open?: () => void;
}

const PLACES: { label: string; icon: LucideIcon; spec: Omit<TabSpec, "connection"> }[] = [
  { label: "Overview", icon: Activity, spec: { kind: "overview" } },
  { label: "Topology", icon: Workflow, spec: { kind: "topology" } },
  { label: "Nodes", icon: Cpu, spec: { kind: "nodes" } },
  { label: "Connections", icon: Plug, spec: { kind: "connections" } },
  { label: "Channels", icon: Radio, spec: { kind: "channels" } },
  ...ADMIN_SECTIONS.map((s) => ({ label: s.label, icon: adminIcon(s.id), spec: { kind: "admin" as const, section: s.id } })),
];

/**
 * The search results as tree rows: connections whose name matches, and
 * under the connected ones the places, vhosts, queues and exchanges that
 * match. `first` is what Enter opens.
 */
export function useSearchRows(query: string, found: FoundObject[]): { rows: SearchRow[]; first: SearchRow | null } {
  const profiles = useConnectionsStore((s) => s.profiles);
  const sessions = useConnectionsStore((s) => s.sessions);
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows: SearchRow[] = [];
    let first: SearchRow | null = null;
    const push = (row: SearchRow) => {
      rows.push(row);
      if (!first && row.open && row.depth > 1) first = row;
    };
    for (const env of byEnvironment(profiles)) {
      const envRows: SearchRow[] = [];
      for (const p of env.profiles) {
        const connected = sessions[p.id] !== undefined;
        const children: SearchRow[] = [];
        if (connected) {
          for (const place of PLACES) {
            if (!place.label.toLowerCase().includes(q)) continue;
            children.push({ key: `${p.id}:${place.label}`, depth: 2, label: place.label, icon: place.icon, cid: p.id, spec: place.spec, open: () => openOn(p.id, place.spec) });
          }
          const mine = found.filter((f) => f.cid === p.id);
          const vhosts = [...new Set(mine.map((f) => f.vhost))].sort();
          for (const vhost of vhosts) {
            const here = mine.filter((f) => f.vhost === vhost && f.kind !== "vhost");
            children.push({
              key: `${p.id}:v:${vhost}`,
              depth: 2,
              label: vhost,
              icon: Layers,
              mono: true,
              cid: p.id,
              spec: { kind: "queues", vhost },
              found: { cid: p.id, kind: "vhost", vhost, name: vhost },
              open: () => openOn(p.id, { kind: "queues", vhost }),
            });
            for (const f of here) {
              const spec = { kind: f.kind as "queue" | "exchange", vhost, name: f.name };
              children.push({
                key: `${p.id}:${f.kind}:${vhost}:${f.name}`,
                depth: 3,
                label: f.name,
                icon: f.kind === "exchange" ? Split : f.type === "stream" ? Waves : Inbox,
                mono: true,
                trailing: f.kind === "exchange" ? f.type : f.messages !== undefined ? f.messages.toLocaleString("en") : undefined,
                cid: p.id,
                spec,
                found: f,
                open: () => openOn(p.id, spec),
              });
            }
          }
        }
        if (children.length === 0 && !p.name.toLowerCase().includes(q)) continue;
        envRows.push({
          key: p.id,
          depth: 1,
          label: p.name,
          profile: p,
          open: () => (connected ? openOn(p.id, { kind: "overview" }) : void useConnectionsStore.getState().connect(p.id)),
        });
        envRows.push(...children);
      }
      if (envRows.length === 0) continue;
      rows.push({ key: `env:${env.id}`, depth: 0, label: env.label, trailing: String(env.profiles.length) });
      envRows.forEach(push);
    }
    // A connection name alone is still worth Enter, when it's all there is.
    first ??= rows.find((r) => r.open) ?? null;
    return { rows, first };
  }, [query, found, profiles, sessions]);
}

/** The search results, in the tree's own rows. */
export function SearchResults({ query, rows, loading }: { query: string; rows: SearchRow[]; loading: boolean }) {
  const activeTabId = useSessionsStore((s) => s.activeTabId);
  const q = query.trim().toLowerCase();
  if (rows.length === 0) {
    return loading ? (
      <TreeNote depth={0}>
        <Loader2 className="mr-1.5 inline size-3 animate-spin" />
        Searching connected clusters…
      </TreeNote>
    ) : (
      <p className="px-3 py-2.5 text-sm text-fg-3">Nothing matches “{query.trim()}”.</p>
    );
  }
  return (
    <>
      {rows.map((row) => {
        if (row.depth === 0) {
          return (
            <TreeRow
              key={row.key}
              depth={0}
              expanded
              icon={<FolderOpen className="size-3.5 shrink-0 text-fg-2" aria-hidden />}
              label={row.label}
              trailing={<span>{row.trailing}</span>}
            />
          );
        }
        const selected = row.spec && row.cid ? activeTabId === tabKey({ ...row.spec, connection: { id: row.cid, name: "", summary: "" } }) : false;
        const Icon = row.icon;
        const f = row.found;
        const entries =
          f && f.kind === "queue"
            ? () => queueMenuEntries(f.cid, f.vhost, f.name, f.type === "stream")
            : f && f.kind === "exchange"
              ? () => exchangeMenuEntries(f.cid, f.vhost, f.name)
              : f && f.kind === "vhost"
                ? () => vhostMenuEntries(f.cid, f.vhost)
                : null;
        const item = (
          <TreeRow
            key={row.key}
            depth={row.depth}
            selected={selected}
            icon={
              row.profile ? (
                <ConnectionChip name={row.profile.name} color={connectionColor(row.profile.id, row.profile.color)} />
              ) : Icon ? (
                <Icon className="size-3.5 shrink-0 text-fg-2" aria-hidden />
              ) : null
            }
            label={<Highlighted name={row.label} query={q} />}
            labelClassName={cn(row.mono && "font-data", row.profile && "font-medium")}
            trailing={row.trailing ? <span className="tabular-nums">{row.trailing}</span> : undefined}
            onActivate={row.open}
          />
        );
        return entries ? (
          <RowContextMenu key={row.key} entries={entries}>
            {item}
          </RowContextMenu>
        ) : (
          item
        );
      })}
      {loading && (
        <TreeNote depth={0}>
          <Loader2 className="mr-1.5 inline size-3 animate-spin" />
          Searching…
        </TreeNote>
      )}
    </>
  );
}
