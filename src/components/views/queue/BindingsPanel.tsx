import { useCallback, useMemo } from "react";
import { Link, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Column } from "@/components/data/DataTable";
import { DataTable } from "@/components/data/DataTable";
import { EmptyState, ErrorState, Loading } from "@/components/data/parts";
import { Button } from "@/components/ui/button";
import { invalidate, useLive } from "@/hooks/useLive";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { confirmDestructive, isReadOnly } from "@/lib/rabbit/guard";
import { openOn } from "@/lib/rabbit/nav";
import { paths } from "@/lib/rabbit/paths";
import { openDialog } from "@/store/dialogStore";
import type { Binding } from "@/types/rabbit";
import { refreshQueues } from "./lib/transfer";

/** What routes into the queue; bind and unbind. */
export default function BindingsPanel({ cid, vhost, name, shown }: { cid: string; vhost: string; name: string; shown: boolean }) {
  const live = useLive<Binding[]>(`${cid}:queue-bindings:${vhost}:${name}`, () => rabbit(cid).get<Binding[]>(paths.queueBindings(vhost, name)), {
    enabled: shown,
  });
  const readOnly = isReadOnly(cid);

  const unbind = useCallback(
    async (b: Binding) => {
      const ok = await confirmDestructive(cid, {
        title: "Remove this binding?",
        message: `${b.source} stops routing "${b.routing_key}" to ${name}. Messages already in the queue stay.`,
        confirmLabel: "Unbind",
      });
      if (!ok) return;
      try {
        await rabbit(cid).del(paths.binding(vhost, b.source, "queue", name, b.properties_key));
        toast.success("Binding removed", { description: `${b.source} → ${name}` });
        refreshQueues(cid);
        invalidate(`${cid}:exchange`); // the exchange view lists its bindings too
      } catch (e) {
        toast.error("Unbind failed", { description: errorText(e) });
      }
    },
    [cid, vhost, name],
  );

  const columns = useMemo<Column<Binding>[]>(
    () => [
      { id: "n", header: "#", width: 44, align: "right", cell: (_, i) => <span className="text-fg-3">{i + 1}</span> },
      {
        id: "source",
        header: "source",
        width: 260,
        cell: (b) =>
          b.source === "" ? (
            <span className="text-fg-3">(AMQP default)</span>
          ) : (
            <button
              type="button"
              className="max-w-full truncate text-left text-json-bson hover:underline"
              title="Open the exchange"
              onClick={() => openOn(cid, { kind: "exchange", vhost, name: b.source })}
            >
              {b.source}
            </button>
          ),
        sortValue: (b) => b.source,
      },
      {
        id: "rk",
        header: "routing_key",
        width: 260,
        cell: (b) => (b.routing_key ? b.routing_key : <span className="text-fg-3">""</span>),
        sortValue: (b) => b.routing_key,
      },
      {
        id: "args",
        header: "arguments",
        width: 240,
        cell: (b) =>
          b.arguments && Object.keys(b.arguments).length ? JSON.stringify(b.arguments) : <span className="text-fg-3">{"{}"}</span>,
      },
      {
        id: "act",
        header: "",
        width: 96,
        align: "right",
        mono: false,
        cell: (b) =>
          b.source === "" ? (
            <span className="text-xs text-fg-3" title="Every queue is bound to the default exchange by its name; it can't be removed">
              implicit
            </span>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              disabled={readOnly}
              title={readOnly ? "This connection is read-only" : undefined}
              onClick={() => void unbind(b)}
            >
              Unbind
            </Button>
          ),
      },
    ],
    [cid, vhost, readOnly, unbind],
  );

  const rows = live.data ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[34px] shrink-0 items-center gap-3 border-b border-line px-3 text-sm text-fg-2">
        <span>
          <b className="font-mono font-medium text-fg">{rows.length}</b> bindings
        </span>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          disabled={readOnly}
          title={readOnly ? "This connection is read-only" : undefined}
          onClick={() =>
            openDialog("create-binding", {
              connectionId: cid,
              vhost,
              name,
              data: { destination: name, destinationType: "queue" },
            })
          }
        >
          <Plus />
          Add binding
        </Button>
      </div>
      {live.error && !live.data ? (
        <ErrorState error={live.error} onRetry={() => void live.refresh()} />
      ) : !live.data ? (
        <Loading />
      ) : rows.length ? (
        <DataTable aria-label="Bindings" rows={rows} columns={columns} rowKey={(b) => `${b.source}\u0000${b.properties_key}`} />
      ) : (
        <EmptyState icon={Link} title="No bindings" />
      )}
    </div>
  );
}

