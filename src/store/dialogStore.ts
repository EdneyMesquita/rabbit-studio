import { create } from "zustand";

/**
 * Task dialogs any part of the app can open (the palette, a context menu,
 * a view's toolbar): which one is open, and what it was opened on. Each
 * kind's component is registered in components/views/dialogs.tsx.
 */
export type DialogKind =
  | "create-vhost"
  | "create-user"
  | "create-policy"
  | "create-queue"
  | "create-exchange"
  | "create-binding"
  | "create-upstream"
  | "create-shovel"
  | "purge-queue"
  | "delete-queue"
  | "delete-exchange"
  | "move-messages"
  | "publish";

export interface DialogContext {
  connectionId: string;
  vhost?: string | null;
  /** The queue or exchange it was opened on. */
  name?: string | null;
  /** Extra, kind-specific: message fingerprints to move, a source exchange... */
  data?: Record<string, unknown>;
}

interface DialogState {
  open: { kind: DialogKind; context: DialogContext } | null;
  show: (kind: DialogKind, context: DialogContext) => void;
  close: () => void;
}

export const useDialogStore = create<DialogState>((set) => ({
  open: null,
  show: (kind, context) => set({ open: { kind, context } }),
  close: () => set({ open: null }),
}));

export function openDialog(kind: DialogKind, context: DialogContext) {
  useDialogStore.getState().show(kind, context);
}
