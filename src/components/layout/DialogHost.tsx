import { lazy, Suspense } from "react";
import { useUiStore } from "../../store/uiStore";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { TaskDialogHost } from "../views/dialogs";

// Loaded on first use, keeping them out of the startup bundle.
const ConnectionForm = lazy(() =>
  import("../connections/ConnectionForm").then((m) => ({ default: m.ConnectionForm })),
);
const ConnectionsImportExportDialog = lazy(() =>
  import("../connections/ConnectionsImportExportDialog").then((m) => ({
    default: m.ConnectionsImportExportDialog,
  })),
);
const EditConnectionDialog = lazy(() =>
  import("./EditConnectionDialog").then((m) => ({ default: m.EditConnectionDialog })),
);

/**
 * App-level dialogs, opened from anywhere: the connection form (new, edit,
 * duplicate) and import / export through uiStore, the task dialogs (new
 * queue, purge...) through dialogStore; and the questions `confirm()` asks,
 * above them all.
 */
export function DialogHost() {
  const dialog = useUiStore((s) => s.connectionDialog);
  const setConnectionDialog = useUiStore((s) => s.setConnectionDialog);
  const importExportOpen = useUiStore((s) => s.importExportOpen);
  const setImportExportOpen = useUiStore((s) => s.setImportExportOpen);
  const close = () => setConnectionDialog(null);

  let content = null;
  if (dialog?.mode === "new") content = <ConnectionForm onSaved={close} onCancel={close} />;
  else if (dialog?.mode === "edit" || dialog?.mode === "duplicate") {
    content = (
      <EditConnectionDialog
        key={`${dialog.mode}/${dialog.id}`}
        id={dialog.id}
        duplicate={dialog.mode === "duplicate"}
        onClose={close}
      />
    );
  } else if (importExportOpen) {
    content = <ConnectionsImportExportDialog onClose={() => setImportExportOpen(false)} />;
  }
  return (
    <>
      <Suspense fallback={null}>{content}</Suspense>
      <TaskDialogHost />
      <ConfirmDialog />
    </>
  );
}
