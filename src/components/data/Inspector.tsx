import type { ReactNode } from "react";
import { X } from "lucide-react";
import { InspectorResizer } from "@/components/common/InspectorResizer";
import { useUiStore } from "@/store/uiStore";

/**
 * The resizable panel at the right of a view, showing the selected row
 * (DESIGN.md: the inspector). Its width is shared by every view.
 */
export function Inspector({
  title,
  subtitle,
  actions,
  onClose,
  children,
  label,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  /** Accessible name of the panel. */
  label: string;
}) {
  const width = useUiStore((s) => s.inspectorWidth);
  return (
    <aside
      aria-label={label}
      data-inspector=""
      className="relative flex min-h-0 shrink-0 flex-col border-l border-line bg-editor"
      style={{ width }}
    >
      <InspectorResizer width={width} />
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-b border-line px-3 py-1.5">
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[12.5px] font-medium text-fg">{title}</div>
          {subtitle && <div className="truncate text-xs text-fg-3">{subtitle}</div>}
        </div>
        {actions}
        {onClose && (
          <button
            type="button"
            aria-label="Close inspector"
            className="grid size-6 place-items-center rounded-sm text-fg-3 hover:bg-hover hover:text-fg"
            onClick={onClose}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}
