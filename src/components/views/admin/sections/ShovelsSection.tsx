import { useCallback, useMemo, useState } from "react";
import { Pencil, Plus, RotateCw, Trash2, Waypoints } from "lucide-react";
import { TypedTree } from "@/components/data/TypedTree";
import { DataTable, type Column } from "@/components/data/DataTable";
import { Inspector } from "@/components/data/Inspector";
import { ErrorState, FilterField, KeyValues, Loading, SectionHeader, Spacer, StateLabel, ViewTitle, ViewToolbar, Dash } from "@/components/data/parts";
import type { MenuEntry } from "@/components/common/ActionMenu";
import { Button } from "@/components/ui/button";
import { useLive } from "@/hooks/useLive";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { confirmDestructive, isReadOnly } from "@/lib/rabbit/guard";
import { int, shortNode } from "@/lib/rabbit/format";
import { paths } from "@/lib/rabbit/paths";
import { openDialog } from "@/store/dialogStore";
import type { Parameter, ShovelStatus } from "@/types/rabbit";
import { isNotFound, maskDeep, maskUri } from "../adminLogic";
import { PluginOff, READ_ONLY_REASON, SectionFrame, mutate, mutating, stateTone, type SectionProps } from "../shared";

interface ShovelRow {
  key: string;
  name: string;
  vhost: string;
  state: string;
  type: "dynamic" | "static";
  status?: ShovelStatus;
  def?: Parameter;
}

const keyOf = (r: ShovelRow) => r.key;

/** null when the plugin is off. */
async function load(cid: string): Promise<ShovelRow[] | null> {
  const api = rabbit(cid);
  try {
    const [status, defs] = await Promise.all([api.get<ShovelStatus[]>(paths.shovels()), api.get<Parameter[]>(paths.parameters("shovel"))]);
    const byKey = new Map(defs.map((d) => [`${d.vhost}\u0000${d.name}`, d]));
    const seen = new Set<string>();
    const rows: ShovelRow[] = status.map((s) => {
      const key = `${s.vhost}\u0000${s.name}`;
      seen.add(key);
      return { key, name: s.name, vhost: s.vhost, state: s.state, type: s.type, status: s, def: byKey.get(key) };
    });
    // Defined but not reporting: the shovel is not running anywhere.
    for (const [key, d] of byKey) if (!seen.has(key)) rows.push({ key, name: d.name, vhost: d.vhost, state: "not running", type: "dynamic", def: d });
    return rows;
  } catch (e) {
    if (isNotFound(errorText(e))) return null;
    throw e;
  }
}

function endpoint(r: ShovelRow, side: "src" | "dest"): string {
  const s = r.status;
  const d = (r.def?.value ?? {}) as Record<string, unknown>;
  const queue = (s?.[`${side}_queue`] ?? d[`${side}-queue`]) as string | undefined;
  const exchange = (s?.[`${side}_exchange`] ?? d[`${side}-exchange`]) as string | undefined;
  if (queue) return `queue ${queue}`;
  if (exchange) return `exchange ${exchange}`;
  return "–";
}

function protocols(r: ShovelRow): string {
  const d = (r.def?.value ?? {}) as Record<string, string | undefined>;
  const a = r.status?.src_protocol ?? d["src-protocol"] ?? "amqp091";
  const b = r.status?.dest_protocol ?? d["dest-protocol"] ?? "amqp091";
  return a === b ? a : `${a} → ${b}`;
}

export default function ShovelsSection({ cid, tab, shown }: SectionProps) {
  const live = useLive<ShovelRow[] | null>(`${cid}:admin:shovels`, () => load(cid), { enabled: shown });
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const readOnly = isReadOnly(cid);
  const data = live.data;

  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (data ?? []).filter((r) => !f || r.name.toLowerCase().includes(f) || r.vhost.toLowerCase().includes(f) || r.state.includes(f));
  }, [data, filter]);

  const restart = useCallback(
    (r: ShovelRow) => mutate(cid, () => rabbit(cid).del(paths.shovelRestart(r.vhost, r.name)), "Shovel restarted", `${r.name} on ${r.vhost}`),
    [cid],
  );
  const edit = useCallback((r: ShovelRow) => openDialog("create-shovel", { connectionId: cid, vhost: r.vhost, name: r.name, data: { shovel: r.def } }), [cid]);
  const remove = useCallback(
    async (r: ShovelRow) => {
      const ok = await confirmDestructive(cid, {
        title: `Delete shovel ${r.name}`,
        guard: r.name,
        message: `${r.name} in ${r.vhost} stops moving messages and is removed. Messages already moved stay where they are.`,
        confirmLabel: "Delete shovel",
      });
      if (ok && (await mutate(cid, () => rabbit(cid).del(paths.parameter("shovel", r.vhost, r.name)), "Shovel deleted", `${r.name} on ${r.vhost}`))) setSelected(new Set());
    },
    [cid],
  );

  const columns = useMemo<Column<ShovelRow>[]>(
    () => [
      { id: "name", header: "name", width: 190, cell: (r) => r.name, sortValue: (r) => r.name },
      { id: "vhost", header: "vhost", width: 110, cell: (r) => <span className="text-fg-2">{r.vhost}</span>, sortValue: (r) => r.vhost },
      { id: "state", header: "state", width: 120, mono: false, cell: (r) => <StateLabel tone={stateTone(r.state)}>{r.state}</StateLabel>, sortValue: (r) => r.state },
      { id: "src", header: "source", width: 230, cell: (r) => endpoint(r, "src"), sortValue: (r) => endpoint(r, "src") },
      { id: "dest", header: "destination", width: 230, cell: (r) => endpoint(r, "dest"), sortValue: (r) => endpoint(r, "dest") },
      { id: "protocol", header: "protocol", width: 100, cell: protocols },
      { id: "type", header: "type", width: 80, cell: (r) => r.type, sortValue: (r) => r.type },
      { id: "reason", header: "reason", cell: (r) => (r.status?.reason ? <span className="text-danger">{r.status.reason}</span> : "") },
    ],
    [],
  );

  const menu = useCallback(
    (r: ShovelRow): MenuEntry[] => [
      { label: "Restart", icon: RotateCw, disabled: readOnly || !r.status, onSelect: () => void restart(r) },
      { label: "Edit shovel", icon: Pencil, disabled: readOnly || !r.def, onSelect: () => edit(r) },
      { separator: true },
      { label: "Delete shovel", icon: Trash2, danger: true, disabled: readOnly || !r.def, onSelect: () => void remove(r) },
    ],
    [readOnly, restart, edit, remove],
  );

  const current = selected.size === 1 ? (data ?? []).find((r) => r.key === [...selected][0]) : undefined;
  const focusRow = tab.focus ? (data ?? []).find((r) => r.name === tab.focus) : undefined;
  const running = (data ?? []).filter((r) => r.state === "running").length;

  return (
    <SectionFrame
      toolbar={
        <ViewToolbar>
          <ViewTitle icon={Waypoints} name="Shovels" kind={data ? `${int(data.length)} in total · ${running} running` : undefined} />
          <FilterField value={filter} onChange={setFilter} placeholder="Filter by name, vhost or state" className="ml-2" />
          <Spacer />
          <Button variant="secondary" onClick={() => openDialog("create-shovel", { connectionId: cid })} {...mutating(cid)} disabled={readOnly || data === null}>
            <Plus />
            New shovel
          </Button>
        </ViewToolbar>
      }
      inspector={
        current ? (
          <Inspector
            label="Shovel"
            title={current.name}
            subtitle={`${current.type} shovel`}
            actions={
              <>
                <Button size="sm" variant="ghost" disabled={readOnly || !current.status} title={readOnly ? READ_ONLY_REASON : "Restart"} onClick={() => void restart(current)}>
                  <RotateCw />
                  Restart
                </Button>
                <Button size="sm" variant="ghost" disabled={readOnly || !current.def} title={readOnly ? READ_ONLY_REASON : current.def ? "Edit shovel" : "Static shovels are set in the broker's configuration"} onClick={() => edit(current)}>
                  <Pencil />
                </Button>
                <Button size="sm" variant="ghost" disabled={readOnly || !current.def} title={readOnly ? READ_ONLY_REASON : current.def ? "Delete shovel" : "Static shovels are set in the broker's configuration"} onClick={() => void remove(current)}>
                  <Trash2 />
                </Button>
              </>
            }
          >
            <KeyValues
              rows={[
                ["state", <StateLabel key="s" tone={stateTone(current.state)}>{current.state}</StateLabel>],
                ["vhost", current.vhost],
                ["node", current.status?.node ? shortNode(current.status.node) : <Dash />],
                ["source", endpoint(current, "src")],
                ["source URI", current.status?.src_uri ? maskUri(current.status.src_uri) : <Dash />],
                ["destination", endpoint(current, "dest")],
                ["dest URI", current.status?.dest_uri ? maskUri(current.status.dest_uri) : <Dash />],
                ["protocol", protocols(current)],
                ["since", current.status?.timestamp ?? <Dash />],
              ]}
            />
            {current.status?.reason && (
              <>
                <SectionHeader>Reason</SectionHeader>
                <div className="px-3 pb-2 font-mono text-[12px] break-words text-danger">{current.status.reason}</div>
              </>
            )}
            {current.def && (
              <>
                <SectionHeader>Definition</SectionHeader>
                <TypedTree value={maskDeep(current.def.value) as Record<string, unknown>} open={2} />
              </>
            )}
          </Inspector>
        ) : null
      }
    >
      {live.error && data === undefined ? (
        <ErrorState error={live.error} onRetry={() => void live.refresh()} />
      ) : data === undefined ? (
        <Loading />
      ) : data === null ? (
        <PluginOff plugin="shovel" extra="rabbitmq_shovel rabbitmq_shovel_management" />
      ) : (
        <DataTable
          aria-label="Shovels"
          rows={rows}
          columns={columns}
          rowKey={keyOf}
          selected={selected}
          onSelectionChange={(keys) => setSelected(keys)}
          onOpen={readOnly ? undefined : (r) => r.def && edit(r)}
          menu={menu}
          reveal={focusRow?.key ?? null}
          defaultSort={{ column: "name", desc: false }}
          empty={filter ? "No shovels match." : "No shovels. Move and Replay create temporary ones too."}
        />
      )}
    </SectionFrame>
  );
}
