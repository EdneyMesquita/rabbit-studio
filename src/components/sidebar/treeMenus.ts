import {
  Activity,
  Copy,
  Download,
  Eraser,
  Inbox,
  Layers,
  Move,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Rows3,
  Send,
  Shield,
  Split,
  Trash2,
  Unplug,
  Users,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import type { MenuEntry } from "@/components/common/ActionMenu";
import { invalidate } from "../../hooks/useLive";
import { isReadOnly } from "../../lib/rabbit/guard";
import { openOn } from "../../lib/rabbit/nav";
import { confirm } from "../../store/confirmStore";
import { useConnectionsStore } from "../../store/connectionsStore";
import { openDialog } from "../../store/dialogStore";
import { useUiStore } from "../../store/uiStore";
import type { ConnectionProfileMeta, Environment } from "../../types/connection";
import { exchangeLabel } from "../tabs/tabName";

/** Copies a name for pasting elsewhere. */
export function copyName(name: string) {
  navigator.clipboard.writeText(name).then(
    () => toast.success(`Copied ${name}`),
    (e) => toast.error("Couldn't copy the name", { description: String(e) }),
  );
}

export async function deleteConnection(profile: ConnectionProfileMeta) {
  const confirmed = await confirm({
    title: "Delete connection",
    message: `Delete the connection "${profile.name}"? Its saved passwords are removed too. The broker itself is not touched.`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (confirmed) await useConnectionsStore.getState().deleteProfile(profile.id);
}

/** A connection's menu (mockup nodeMenu): session, places, admin, the profile itself. */
export function connectionMenuEntries(profile: ConnectionProfileMeta): MenuEntry[] {
  const store = useConnectionsStore.getState();
  const cid = profile.id;
  const connected = store.sessions[cid] !== undefined;
  const writable = connected && !isReadOnly(cid);
  const entries: MenuEntry[] = [
    { heading: profile.name },
    connected
      ? { label: "Disconnect", icon: Unplug, onSelect: () => void store.disconnect(cid) }
      : { label: "Connect", icon: Plug, onSelect: () => void store.connect(cid) },
  ];
  if (connected) {
    entries.push(
      { label: "Overview", icon: Activity, onSelect: () => openOn(cid, { kind: "overview" }) },
      { label: "Topology", icon: Workflow, onSelect: () => openOn(cid, { kind: "topology" }) },
      { label: "Refresh", icon: RefreshCw, shortcut: "F5", onSelect: () => invalidate(`${cid}:`) },
      { label: "Export definitions", icon: Download, onSelect: () => openOn(cid, { kind: "admin", section: "definitions" }) },
    );
    if (writable) entries.push({ label: "New queue…", icon: Plus, onSelect: () => openDialog("create-queue", { connectionId: cid }) });
    entries.push(
      { separator: true },
      { heading: "Admin" },
      { label: "Users", icon: Users, onSelect: () => openOn(cid, { kind: "admin", section: "users" }) },
      { label: "Virtual hosts", icon: Layers, onSelect: () => openOn(cid, { kind: "admin", section: "vhosts" }) },
      { label: "Policies", icon: Shield, onSelect: () => openOn(cid, { kind: "admin", section: "policies" }) },
    );
    if (writable) entries.push({ label: "New virtual host…", icon: Plus, onSelect: () => openDialog("create-vhost", { connectionId: cid }) });
  }
  const ui = useUiStore.getState();
  entries.push(
    { separator: true },
    { label: "Edit connection…", icon: Pencil, onSelect: () => ui.setConnectionDialog({ mode: "edit", id: cid }) },
    { label: "Duplicate…", icon: Copy, onSelect: () => ui.setConnectionDialog({ mode: "duplicate", id: cid }) },
    { label: "Delete connection…", icon: Trash2, danger: true, onSelect: () => void deleteConnection(profile) },
  );
  return entries;
}

/** An environment folder's menu: its connections at once, or a new one. */
export function environmentMenuEntries(env: Environment, label: string): MenuEntry[] {
  const store = useConnectionsStore.getState();
  const mine = store.profiles.filter((p) => p.environment === env);
  const offline = mine.filter((p) => !store.sessions[p.id]);
  const online = mine.filter((p) => store.sessions[p.id]);
  return [
    { heading: label },
    {
      label: offline.length ? `Connect ${offline.length === 1 ? offline[0].name : `all ${offline.length}`}` : "Every connection here is connected",
      icon: Plug,
      disabled: offline.length === 0,
      onSelect: () => offline.forEach((p) => void store.connect(p.id)),
    },
    {
      label: online.length ? `Disconnect ${online.length === 1 ? online[0].name : `all ${online.length}`}` : "Nothing here is connected",
      icon: Unplug,
      disabled: online.length === 0,
      onSelect: () => void store.disconnectAll(online.map((p) => p.id)),
    },
    { separator: true },
    { label: "New connection…", icon: Plus, onSelect: () => useUiStore.getState().setConnectionDialog({ mode: "new" }) },
  ];
}

export function vhostMenuEntries(cid: string, vhost: string): MenuEntry[] {
  const writable = !isReadOnly(cid);
  const entries: MenuEntry[] = [
    { heading: vhost },
    { label: "Queues", icon: Inbox, onSelect: () => openOn(cid, { kind: "queues", vhost }) },
    { label: "Exchanges", icon: Split, onSelect: () => openOn(cid, { kind: "exchanges", vhost }) },
    { label: "Topology", icon: Workflow, onSelect: () => openOn(cid, { kind: "topology", vhost }) },
  ];
  if (writable) {
    entries.push(
      { separator: true },
      { label: "New queue…", icon: Plus, onSelect: () => openDialog("create-queue", { connectionId: cid, vhost }) },
      { label: "New exchange…", icon: Plus, onSelect: () => openDialog("create-exchange", { connectionId: cid, vhost }) },
    );
  }
  entries.push({ separator: true }, { label: "Copy name", icon: Copy, onSelect: () => copyName(vhost) });
  return entries;
}

export function queueMenuEntries(cid: string, vhost: string, name: string, stream: boolean): MenuEntry[] {
  const writable = !isReadOnly(cid);
  const context = { connectionId: cid, vhost, name };
  const entries: MenuEntry[] = [
    { heading: name },
    { label: "Get messages", icon: Rows3, onSelect: () => openOn(cid, { kind: "queue", vhost, name, view: "messages" }) },
  ];
  if (writable) {
    entries.push({ label: "Publish…", icon: Send, onSelect: () => openOn(cid, { kind: "queue", vhost, name, view: "publish" }) });
    if (!stream) entries.push({ label: "Move messages…", icon: Move, onSelect: () => openDialog("move-messages", context) });
  }
  entries.push({ label: "Copy name", icon: Copy, onSelect: () => copyName(name) });
  if (writable) {
    entries.push({ separator: true });
    if (!stream) entries.push({ label: "Purge…", icon: Eraser, danger: true, onSelect: () => openDialog("purge-queue", context) });
    entries.push({ label: stream ? "Delete stream…" : "Delete queue…", icon: Trash2, danger: true, onSelect: () => openDialog("delete-queue", context) });
  }
  return entries;
}

export function exchangeMenuEntries(cid: string, vhost: string, name: string): MenuEntry[] {
  const entries: MenuEntry[] = [{ heading: exchangeLabel(name) }];
  if (!isReadOnly(cid)) {
    entries.push({ label: "Publish…", icon: Send, onSelect: () => openOn(cid, { kind: "exchange", vhost, name, view: "publish" }) });
  }
  entries.push(
    { label: "Show in topology", icon: Workflow, onSelect: () => openOn(cid, { kind: "topology", vhost, focus: name }) },
    { label: "Copy name", icon: Copy, onSelect: () => copyName(name) },
  );
  return entries;
}
