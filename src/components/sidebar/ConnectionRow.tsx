import { memo, useEffect } from "react";
import { Activity, Cpu, Folder, FolderOpen, Lock, Plug, Radio, TriangleAlert, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { RowContextMenu } from "@/components/common/ActionMenu";
import { ConnectionChip } from "@/components/ui/ConnectionChip";
import { connectionColor } from "@/lib/connectionColor";
import { openOn } from "../../lib/rabbit/nav";
import { useConnectionsStore } from "../../store/connectionsStore";
import { adminNode, connectionNode, isOpen, runtimeNode, useExplorerStore } from "../../store/explorerStore";
import { ADMIN_SECTIONS, type TabSpec } from "../../store/sessionsStore";
import type { ConnectionProfileMeta } from "../../types/connection";
import { adminIcon } from "../tabs/tabName";
import { ConnectionStatus } from "./ConnectionStatus";
import { Highlighted } from "./Highlighted";
import { RowMenuButton } from "./RowMenuButton";
import { useIsActiveTab, useNodeProblems, useTreeTotals, useVhosts } from "./treeData";
import { connectionMenuEntries } from "./treeMenus";
import { TreeNote } from "./TreeNote";
import { TreeRow } from "./TreeRow";
import { VhostRow } from "./VhostRow";

interface ConnectionRowProps {
  profile: ConnectionProfileMeta;
  depth: number;
  /** The Explorer search, lowercased, to highlight in the name. */
  query: string;
  /** The Explorer is on screen. */
  shown: boolean;
}

/** A saved connection: its state, problems and, once connected, everything under it. */
export const ConnectionRow = memo(function ConnectionRow({ profile, depth, query, shown }: ConnectionRowProps) {
  const cid = profile.id;
  const session = useConnectionsStore((s) => s.sessions[cid]);
  const connecting = useConnectionsStore((s) => s.connecting[cid] ?? false);
  const connectError = useConnectionsStore((s) => s.connectErrors[cid]);
  const id = connectionNode(cid);
  const open = useExplorerStore((s) => isOpen(s.open, id));
  const toggle = useExplorerStore((s) => s.toggle);
  const connected = session !== undefined;
  const problems = useNodeProblems(cid, connected && shown);

  // A connection opens in the tree when it connects.
  useEffect(() => {
    if (connected) useExplorerStore.getState().setOpen(id, true);
  }, [connected, id]);

  const connect = () => void useConnectionsStore.getState().connect(cid);
  const entries = () => connectionMenuEntries(profile);

  return (
    <>
      <RowContextMenu entries={entries}>
        <TreeRow
          depth={depth}
          expanded={connected ? open : undefined}
          icon={<ConnectionChip name={profile.name} color={connectionColor(cid, profile.color)} />}
          labelClassName="font-medium"
          label={<Highlighted name={profile.name} query={query} />}
          title={`${profile.name}\n${profile.summary}${connected ? "" : "\nDouble-click or Enter to connect"}`}
          trailing={
            <>
              {problems.length > 0 && (
                <span
                  className={problems.some((p) => p.severity === "crit") ? "grid place-items-center text-danger" : "grid place-items-center text-warn"}
                  title={problems.map((p) => `${p.title}: ${p.object}`).join("\n")}
                >
                  <TriangleAlert className="size-3" aria-label={`${problems.length} problems`} />
                </span>
              )}
              {(profile.readOnly || profile.typedConfirmation) && (
                <span
                  className="grid place-items-center text-fg-3"
                  title={profile.readOnly ? "Read-only: nothing that changes the broker is offered" : "Destructive actions ask for the name"}
                >
                  <Lock className="size-3" aria-label={profile.readOnly ? "Read-only" : "Guarded"} />
                </span>
              )}
              <ConnectionStatus
                name={profile.name}
                connected={connected}
                connecting={connecting}
                serverVersion={session?.serverVersion ?? null}
                error={connected ? undefined : connectError}
                onRetry={connect}
              />
              <RowMenuButton entries={entries} label={`Actions for ${profile.name}`} />
            </>
          }
          onActivate={() => {
            if (connected) toggle(id);
          }}
          onKeyDown={(e) => {
            if (!connected && e.key === "Enter" && e.target === e.currentTarget) connect();
          }}
          onDoubleClick={() => {
            if (!connected) connect();
          }}
        />
      </RowContextMenu>
      {connected && open && <ConnectionChildren cid={cid} depth={depth + 1} shown={shown} />}
    </>
  );
});

interface LeafProps {
  cid: string;
  depth: number;
  icon: LucideIcon;
  label: string;
  spec: Omit<TabSpec, "connection">;
  count?: number;
}

/** A row that opens a tab, highlighted while that tab is the active one. */
function Leaf({ cid, depth, icon: Icon, label, spec, count }: LeafProps) {
  const selected = useIsActiveTab(cid, spec);
  return (
    <TreeRow
      depth={depth}
      selected={selected}
      icon={<Icon className="size-3.5 shrink-0 text-fg-2" aria-hidden />}
      label={label}
      trailing={count !== undefined ? <span className="tabular-nums">{count.toLocaleString("en")}</span> : undefined}
      onActivate={() => openOn(cid, spec)}
    />
  );
}

function FolderNode({ id, depth, label, trailing }: { id: string; depth: number; label: string; trailing?: string }) {
  const open = useExplorerStore((s) => isOpen(s.open, id));
  const toggle = useExplorerStore((s) => s.toggle);
  const Icon = open ? FolderOpen : Folder;
  return (
    <TreeRow
      depth={depth}
      expanded={open}
      icon={<Icon className="size-3.5 shrink-0 text-fg-2" aria-hidden />}
      label={label}
      trailing={trailing ? <span>{trailing}</span> : undefined}
      onActivate={() => toggle(id)}
    />
  );
}

/** Under a connected connection: its views, Runtime, Admin, then one row per vhost. */
function ConnectionChildren({ cid, depth, shown }: { cid: string; depth: number; shown: boolean }) {
  const runtimeOpen = useExplorerStore((s) => isOpen(s.open, runtimeNode(cid)));
  const adminOpen = useExplorerStore((s) => isOpen(s.open, adminNode(cid)));
  const vhosts = useVhosts(cid, shown);
  const totals = useTreeTotals(cid, shown).data?.object_totals;

  return (
    <div role="group">
      <Leaf cid={cid} depth={depth} icon={Activity} label="Overview" spec={{ kind: "overview" }} />
      <Leaf cid={cid} depth={depth} icon={Workflow} label="Topology" spec={{ kind: "topology" }} />
      <FolderNode
        id={runtimeNode(cid)}
        depth={depth}
        label="Runtime"
        trailing={totals ? `${totals.connections.toLocaleString("en")} conns` : undefined}
      />
      {runtimeOpen && (
        <div role="group">
          <Leaf cid={cid} depth={depth + 1} icon={Cpu} label="Nodes" spec={{ kind: "nodes" }} />
          <Leaf cid={cid} depth={depth + 1} icon={Plug} label="Connections" spec={{ kind: "connections" }} count={totals?.connections} />
          <Leaf cid={cid} depth={depth + 1} icon={Radio} label="Channels" spec={{ kind: "channels" }} count={totals?.channels} />
        </div>
      )}
      <FolderNode id={adminNode(cid)} depth={depth} label="Admin" trailing="users, vhosts, policies" />
      {adminOpen && (
        <div role="group">
          {ADMIN_SECTIONS.map((s) => (
            <Leaf key={s.id} cid={cid} depth={depth + 1} icon={adminIcon(s.id)} label={s.label} spec={{ kind: "admin", section: s.id }} />
          ))}
        </div>
      )}
      {vhosts.error && !vhosts.data && (
        <TreeNote depth={depth} tone="danger">
          {vhosts.error}
        </TreeNote>
      )}
      {!vhosts.data && !vhosts.error && <TreeNote depth={depth}>Loading vhosts…</TreeNote>}
      {vhosts.data?.map((v) => (
        <VhostRow key={v.name} cid={cid} vhost={v.name} messages={v.messages} depth={depth} shown={shown} />
      ))}
    </div>
  );
}
