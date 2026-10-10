import { Button } from "@/components/ui/button";
import { int } from "@/lib/rabbit/format";
import type { RunningTransfer } from "./lib/transfer";

/** A running move or replay: what, how far, and a way out. */
export function TransferProgress({ running, onCancel }: { running: RunningTransfer; onCancel: () => void }) {
  const f = running.total > 0 ? Math.min(1, running.done / running.total) : 0;
  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line px-3 text-sm text-fg-2" role="status">
      <span className="truncate">{running.label}</span>
      <span className="h-1 w-40 shrink-0 overflow-hidden rounded-xs bg-line" aria-hidden>
        <i className="block h-full bg-accent transition-[width] duration-150" style={{ width: `${f * 100}%` }} />
      </span>
      <span className="font-mono text-[12px] tabular-nums">
        {int(running.done)} / {running.total ? int(running.total) : "…"}
      </span>
      <span className="flex-1" />
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
