import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Which tool window the side panel shows, or null when it's hidden. */
export type SidePanel = "explorer" | "problems" | null;

/** The connection dialog: a new connection, editing a saved one, or a copy of one. */
export type ConnectionDialog =
  | { mode: "new" }
  | { mode: "edit"; id: string }
  | { mode: "duplicate"; id: string }
  | null;

interface UiState {
  /** Sidebar width in px. */
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  sidePanel: SidePanel;
  /** Shows a tool window; showing the one already open hides the panel. */
  toggleSidePanel: (panel: Exclude<SidePanel, null>) => void;
  setSidePanel: (panel: SidePanel) => void;
  /** The inspector beside a list, in px. */
  inspectorWidth: number;
  setInspectorWidth: (width: number) => void;
  connectionDialog: ConnectionDialog;
  setConnectionDialog: (dialog: ConnectionDialog) => void;
  /** The import / export connections dialog. */
  importExportOpen: boolean;
  setImportExportOpen: (open: boolean) => void;
  /** The Ctrl+K quick-open palette. */
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
}

export const DEFAULT_SIDEBAR_WIDTH = 300;
export const DEFAULT_INSPECTOR_WIDTH = 380;

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
      setSidebarWidth: (width) => set({ sidebarWidth: width }),
      sidePanel: "explorer",
      toggleSidePanel: (panel) => set((s) => ({ sidePanel: s.sidePanel === panel ? null : panel })),
      setSidePanel: (panel) => set({ sidePanel: panel }),
      inspectorWidth: DEFAULT_INSPECTOR_WIDTH,
      setInspectorWidth: (width) => set({ inspectorWidth: width }),
      connectionDialog: null,
      setConnectionDialog: (dialog) => set({ connectionDialog: dialog }),
      importExportOpen: false,
      setImportExportOpen: (open) => set({ importExportOpen: open }),
      paletteOpen: false,
      setPaletteOpen: (open) => set({ paletteOpen: open }),
    }),
    {
      name: "rabbit-studio-ui",
      // v1: a width the startup fit had squeezed to the minimum goes back
      // to the default.
      version: 1,
      migrate: (state, version) => {
        const s = state as { sidebarWidth?: number };
        if (version < 1 && (s.sidebarWidth ?? 0) <= 180) s.sidebarWidth = DEFAULT_SIDEBAR_WIDTH;
        return s as never;
      },
      // Only layout sizes are lasting preferences.
      partialize: (s) => ({ sidebarWidth: s.sidebarWidth, inspectorWidth: s.inspectorWidth }),
    },
  ),
);
