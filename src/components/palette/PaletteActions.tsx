import {
  ArrowLeftRight,
  Bell,
  Database,
  FolderOpen,
  LayoutGrid,
  Moon,
  PanelRight,
  Plus,
  PlugZap,
  RefreshCw,
  Send,
  Sun,
  Unplug,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { CommandGroup, CommandItem, CommandShortcut } from "@/components/ui/command";
import { SPLIT_LAYOUT_ORDER, SPLIT_LAYOUTS } from "../../lib/editorLayout";
import { isReadOnly } from "../../lib/rabbit/guard";
import { openOn } from "../../lib/rabbit/nav";
import { api } from "../../lib/tauri";
import { useConnectionsStore } from "../../store/connectionsStore";
import { openDialog, type DialogKind } from "../../store/dialogStore";
import { useEditorLayoutStore } from "../../store/editorLayoutStore";
import { selectActiveTab, useSessionsStore } from "../../store/sessionsStore";
import { useThemeStore } from "../../store/themeStore";
import { useUiStore } from "../../store/uiStore";
import { connectAll } from "../layout/MainToolbar";
import { refreshActive } from "../layout/useGlobalShortcuts";
import { LayoutIcon } from "../tabs/LayoutPicker";
import { HighlightMatch } from "./HighlightMatch";

interface PaletteActionsProps {
  search: string;
  /** Closes the palette, then runs the choice. */
  run: (action: () => void) => void;
}

interface PaletteAction {
  id: string;
  icon: ReactNode;
  label: string;
  where?: string;
  shortcut?: string;
  perform: () => void;
}

const CREATE: { kind: DialogKind; label: string }[] = [
  { kind: "create-vhost", label: "New virtual host…" },
  { kind: "create-user", label: "New user…" },
  { kind: "create-policy", label: "New policy…" },
  { kind: "create-queue", label: "New queue…" },
  { kind: "create-exchange", label: "New exchange…" },
];

/**
 * The cluster actions act on: the active tab's, or the only one connected.
 * Null when that's ambiguous or nothing is connected.
 */
function useCurrentCluster(): { id: string; name: string; vhost: string | null } | null {
  const tab = useSessionsStore(selectActiveTab);
  const sessions = useConnectionsStore((s) => s.sessions);
  const profiles = useConnectionsStore((s) => s.profiles);
  if (tab?.connection && sessions[tab.connection.id]) return { id: tab.connection.id, name: tab.connection.name, vhost: tab.vhost };
  const connected = profiles.filter((p) => sessions[p.id]);
  return connected.length === 1 ? { id: connected[0].id, name: connected[0].name, vhost: null } : null;
}

/** The palette's commands. */
export function PaletteActions({ search, run }: PaletteActionsProps) {
  const themeId = useThemeStore((s) => s.themeId);
  const layout = useEditorLayoutStore((s) => s.layout);
  const activeTab = useSessionsStore(selectActiveTab);
  const offline = useConnectionsStore((s) => s.profiles.filter((p) => !s.sessions[p.id]).length);
  const cur = useCurrentCluster();

  const actions: PaletteAction[] = [
    {
      id: "new-connection",
      icon: <Plus />,
      label: "New connection…",
      shortcut: "Ctrl N",
      perform: () => useUiStore.getState().setConnectionDialog({ mode: "new" }),
    },
    { id: "global", icon: <LayoutGrid />, label: "Global overview (all clusters)", perform: () => openOn(null, { kind: "global" }) },
  ];
  if (offline > 0) actions.push({ id: "connect-all", icon: <PlugZap />, label: "Connect all", perform: connectAll });
  if (cur) {
    actions.push({
      id: "disconnect",
      icon: <Unplug />,
      label: `Disconnect ${cur.name}`,
      perform: () => void useConnectionsStore.getState().disconnect(cur.id),
    });
    if (!isReadOnly(cur.id)) {
      const context = { connectionId: cur.id, vhost: cur.vhost };
      for (const c of CREATE) {
        actions.push({ id: c.kind, icon: <Plus />, label: c.label, where: cur.name, perform: () => openDialog(c.kind, context) });
      }
      actions.push({
        id: "publish",
        icon: <Send />,
        label: "Publish message…",
        where: cur.name,
        perform: () => openDialog("publish", activeTab?.kind === "exchange" || activeTab?.kind === "queue" ? { ...context, name: activeTab.name } : context),
      });
    }
  }
  if (activeTab) {
    actions.push(
      { id: "refresh", icon: <RefreshCw />, label: "Refresh", where: activeTab.connection?.name, shortcut: "F5", perform: refreshActive },
      {
        id: "open-to-side",
        icon: <PanelRight />,
        label: "Open the tab to the side",
        shortcut: "Ctrl \\",
        perform: () => {
          if (!useEditorLayoutStore.getState().openToSide(activeTab.id)) {
            toast("All four panes are in use", { description: "Close a pane, or drop the tab onto one to replace it." });
          }
        },
      },
    );
    SPLIT_LAYOUT_ORDER.forEach((kind, i) => {
      if (kind === layout) return;
      actions.push({
        id: `layout-${kind}`,
        icon: <LayoutIcon layout={kind} />,
        label: kind === "single" ? "Editor: single pane" : `Split the editor: ${SPLIT_LAYOUTS[kind].label}`,
        shortcut: `Ctrl Alt ${i + 1}`,
        perform: () => useEditorLayoutStore.getState().setLayout(kind),
      });
    });
  }
  const other = themeId === "dark" ? "light" : "dark";
  actions.push(
    {
      id: "theme",
      icon: other === "light" ? <Sun /> : <Moon />,
      label: `Switch to ${other} theme`,
      perform: () => useThemeStore.getState().setTheme(other),
    },
    {
      id: "toggle-explorer",
      icon: <Database />,
      label: "Toggle Explorer",
      shortcut: "Ctrl B",
      perform: () => useUiStore.getState().toggleSidePanel("explorer"),
    },
    { id: "problems", icon: <Bell />, label: "Show problems", perform: () => useUiStore.getState().setSidePanel("problems") },
    {
      id: "import-export",
      icon: <ArrowLeftRight />,
      label: "Import / export connections…",
      perform: () => useUiStore.getState().setImportExportOpen(true),
    },
    {
      id: "open-logs",
      icon: <FolderOpen />,
      label: "Open logs folder",
      perform: () =>
        api.openLogDir().catch((e) => toast.error("Couldn't open the logs folder", { description: String(e) })),
    },
  );

  return (
    <CommandGroup heading="Actions">
      {actions.map((action) => (
        <CommandItem
          key={action.id}
          value={`action:${action.id}`}
          keywords={[action.label, action.where ?? ""]}
          onSelect={() => run(action.perform)}
        >
          {action.icon}
          <span className="min-w-0 truncate">
            <HighlightMatch text={action.label} query={search} />
          </span>
          {action.where && <span className="shrink-0 text-sm text-fg-3">{action.where}</span>}
          {action.shortcut && <CommandShortcut>{action.shortcut}</CommandShortcut>}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
