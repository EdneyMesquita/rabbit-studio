import { lazy, Suspense } from "react";
import type { ComponentType, LazyExoticComponent } from "react";
import { useDialogStore, type DialogKind } from "@/store/dialogStore";
import type { DialogProps } from "./types";

/**
 * Each task dialog, loaded when first opened. Every module default-exports
 * a `(props: DialogProps) => JSX` that renders a Modal.
 */
const DIALOGS: Record<DialogKind, LazyExoticComponent<ComponentType<DialogProps>>> = {
  "create-vhost": lazy(() => import("./admin/dialogs/CreateVhostDialog")),
  "create-user": lazy(() => import("./admin/dialogs/CreateUserDialog")),
  "create-policy": lazy(() => import("./admin/dialogs/CreatePolicyDialog")),
  "create-upstream": lazy(() => import("./admin/dialogs/CreateUpstreamDialog")),
  "create-shovel": lazy(() => import("./admin/dialogs/CreateShovelDialog")),
  "create-queue": lazy(() => import("./lists/dialogs/CreateQueueDialog")),
  "create-exchange": lazy(() => import("./lists/dialogs/CreateExchangeDialog")),
  "create-binding": lazy(() => import("./exchange/dialogs/CreateBindingDialog")),
  "delete-exchange": lazy(() => import("./exchange/dialogs/DeleteExchangeDialog")),
  "purge-queue": lazy(() => import("./queue/dialogs/PurgeQueueDialog")),
  "delete-queue": lazy(() => import("./queue/dialogs/DeleteQueueDialog")),
  "move-messages": lazy(() => import("./queue/dialogs/MoveMessagesDialog")),
  publish: lazy(() => import("./publish/PublishDialog")),
};

/** The open task dialog, if any. */
export function TaskDialogHost() {
  const open = useDialogStore((s) => s.open);
  const close = useDialogStore((s) => s.close);
  if (!open) return null;
  const Dialog = DIALOGS[open.kind];
  return (
    <Suspense fallback={null}>
      <Dialog context={open.context} onClose={close} />
    </Suspense>
  );
}
