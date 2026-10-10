import { useCallback, useMemo, useState } from "react";
import { Globe, Pencil, Plus, Trash2 } from "lucide-react";
import { DataTable, type Column } from "@/components/data/DataTable";
import { Inspector } from "@/components/data/Inspector";
import { JsonView } from "@/components/data/JsonView";
import { ErrorState, FilterField, KeyValues, Loading, SectionHeader, Spacer, StateLabel, ViewTitle, ViewToolbar } from "@/components/data/parts";
import type { MenuEntry } from "@/components/common/ActionMenu";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useLive } from "@/hooks/useLive";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { confirmDestructive, isReadOnly } from "@/lib/rabbit/guard";
import { int, shortNode } from "@/lib/rabbit/format";
import { paths } from "@/lib/rabbit/paths";
import { openDialog } from "@/store/dialogStore";
import type { FederationLink, Parameter } from "@/types/rabbit";
import { isNotFound, maskDeep, maskUri, uriList } from "../adminLogic";
import { PluginOff, READ_ONLY_REASON, SectionFrame, mutate, mutating, stateTone, type SectionProps } from "../shared";

type Show = "upstreams" | "links" | "sets";

interface Loaded {
  upstreams: Parameter[];
  sets: Parameter[];
  links: FederationLink[];
}

/** null when the plugin is off: the management API answers 404 for its paths. */
async function load(cid: string): Promise<Loaded | null> {
  const api = rabbit(cid);
  try {
    const [upstreams, sets, links] = await Promise.all([
      api.get<Parameter[]>(paths.parameters("federation-upstream")),
      api.get<Parameter[]>(paths.parameters("federation-upstream-set")),
      api.get<FederationLink[]>(paths.federationLinks()),
    ]);
    return { upstreams, sets, links };
  } catch (e) {
    if (isNotFound(errorText(e))) return null;
    throw e;
  }
}

const upstreamKey = (p: Parameter) => `${p.vhost}\u0000${p.name}`;
const linkKey = (l: FederationLink) => `${l.vhost}\u0000${l.id ?? `${l.upstream}/${l.exchange ?? l.queue}/${l.node}`}`;
const val = (p: Parameter, k: string) => (p.value as Record<string, unknown>)[k];

export default function FederationSection({ cid, tab, shown }: SectionProps) {
  const live = useLive<Loaded | null>(`${cid}:admin:federation`, () => load(cid), { enabled: shown });
  const [show, setShow] = useState<Show>("upstreams");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const readOnly = isReadOnly(cid);
  const data = live.data;

  const f = filter.trim().toLowerCase();
  const upstreams = useMemo(() => (data?.upstreams ?? []).filter((p) => !f || p.name.toLowerCase().includes(f) || p.vhost.toLowerCase().includes(f)), [data, f]);
  const links = useMemo(
    () => (data?.links ?? []).filter((l) => !f || l.upstream.toLowerCase().includes(f) || (l.exchange ?? l.queue ?? "").toLowerCase().includes(f) || l.status.includes(f)),
    [data, f],
  );
  const sets = useMemo(() => (data?.sets ?? []).filter((p) => !f || p.name.toLowerCase().includes(f)), [data, f]);

  const edit = useCallback((p: Parameter) => openDialog("create-upstream", { connectionId: cid, vhost: p.vhost, name: p.name, data: { upstream: p } }), [cid]);
  const remove = useCallback(
    async (p: Parameter, what: "upstream" | "upstream set") => {
      const ok = await confirmDestructive(cid, {
        title: `Delete ${what} ${p.name}`,
        message: `Federation links that use ${p.name} in ${p.vhost} stop.`,
        confirmLabel: `Delete ${what}`,
      });
      if (!ok) return;
      const comp = what === "upstream" ? "federation-upstream" : "federation-upstream-set";
      if (await mutate(cid, () => rabbit(cid).del(paths.parameter(comp, p.vhost, p.name)), `${what[0].toUpperCase()}${what.slice(1)} deleted`, p.name)) setSelected(new Set());
    },
    [cid],
  );

  const upstreamColumns = useMemo<Column<Parameter>[]>(
    () => [
      { id: "name", header: "Name", width: 190, cell: (p) => p.name, sortValue: (p) => p.name },
      { id: "vhost", header: "Vhost", width: 120, cell: (p) => <span className="text-fg-2">{p.vhost}</span>, sortValue: (p) => p.vhost },
      {
        id: "uri",
        header: "URI",
        cell: (p) => {
          const u = uriList(val(p, "uri"));
          return u.length ? `${maskUri(u[0])}${u.length > 1 ? `  +${u.length - 1}` : ""}` : "–";
        },
      },
      { id: "ack", header: "Ack mode", width: 100, cell: (p) => String(val(p, "ack-mode") ?? "on-confirm") },
      { id: "prefetch", header: "Prefetch", align: "right", width: 80, cell: (p) => int(val(p, "prefetch-count") as number | undefined), sortValue: (p) => val(p, "prefetch-count") as number | undefined },
      { id: "hops", header: "Max hops", align: "right", width: 80, cell: (p) => int(val(p, "max-hops") as number | undefined), sortValue: (p) => val(p, "max-hops") as number | undefined },
      { id: "expires", header: "Expires", align: "right", width: 90, cell: (p) => int(val(p, "expires") as number | undefined), sortValue: (p) => val(p, "expires") as number | undefined },
      { id: "trust", header: "Trust user-id", width: 100, cell: (p) => (val(p, "trust-user-id") ? "yes" : "no") },
    ],
    [],
  );
  const linkColumns = useMemo<Column<FederationLink>[]>(
    () => [
      { id: "status", header: "Status", width: 110, mono: false, cell: (l) => <StateLabel tone={stateTone(l.status)}>{l.status}</StateLabel>, sortValue: (l) => l.status },
      { id: "type", header: "Type", width: 80, cell: (l) => l.type, sortValue: (l) => l.type },
      { id: "vhost", header: "Vhost", width: 110, cell: (l) => <span className="text-fg-2">{l.vhost}</span>, sortValue: (l) => l.vhost },
      { id: "upstream", header: "Upstream", width: 160, cell: (l) => l.upstream, sortValue: (l) => l.upstream },
      { id: "local", header: "Federated", width: 190, cell: (l) => l.exchange ?? l.queue ?? "–", sortValue: (l) => l.exchange ?? l.queue },
      { id: "remote", header: "Upstream object", width: 190, cell: (l) => l.upstream_exchange ?? l.upstream_queue ?? "–" },
      { id: "node", header: "Node", width: 100, cell: (l) => shortNode(l.node), sortValue: (l) => l.node },
      { id: "uri", header: "URI", width: 230, cell: (l) => (l.uri ? maskUri(l.uri) : "–") },
      { id: "since", header: "Since", width: 150, cell: (l) => l.timestamp ?? "–", sortValue: (l) => l.timestamp },
      { id: "error", header: "Error", cell: (l) => (l.error ? <span className="text-danger">{l.error}</span> : "") },
    ],
    [],
  );
  const setColumns = useMemo<Column<Parameter>[]>(
    () => [
      { id: "name", header: "Name", width: 190, cell: (p) => p.name, sortValue: (p) => p.name },
      { id: "vhost", header: "Vhost", width: 120, cell: (p) => <span className="text-fg-2">{p.vhost}</span>, sortValue: (p) => p.vhost },
      {
        id: "members",
        header: "Upstreams",
        cell: (p) => (Array.isArray(p.value) ? (p.value as { upstream?: string }[]).map((m) => m.upstream).filter(Boolean).join(", ") : "–"),
      },
    ],
    [],
  );

  const upstreamMenu = useCallback(
    (p: Parameter): MenuEntry[] => [
      { label: "Edit upstream", icon: Pencil, disabled: readOnly, onSelect: () => edit(p) },
      { separator: true },
      { label: "Delete upstream", icon: Trash2, danger: true, disabled: readOnly, onSelect: () => void remove(p, "upstream") },
    ],
    [readOnly, edit, remove],
  );
  const setMenu = useCallback(
    (p: Parameter): MenuEntry[] => [{ label: "Delete upstream set", icon: Trash2, danger: true, disabled: readOnly, onSelect: () => void remove(p, "upstream set") }],
    [readOnly, remove],
  );

  const pick = <T,>(list: T[], key: (x: T) => string) => (selected.size === 1 ? list.find((x) => key(x) === [...selected][0]) : undefined);
  const upstream = show === "upstreams" ? pick(data?.upstreams ?? [], upstreamKey) : undefined;
  const set = show === "sets" ? pick(data?.sets ?? [], upstreamKey) : undefined;
  const link = show === "links" ? pick(data?.links ?? [], linkKey) : undefined;

  const running = (data?.links ?? []).filter((l) => l.status === "running").length;

  return (
    <SectionFrame
      toolbar={
        <ViewToolbar>
          <ViewTitle icon={Globe} name="Federation" kind={data ? `${int(data.upstreams.length)} upstreams · ${running}/${data.links.length} links running` : undefined} />
          {data && (
            <SegmentedControl<Show>
              aria-label="What to list"
              value={show}
              onChange={(s) => {
                setShow(s);
                setSelected(new Set());
              }}
              options={[
                { value: "upstreams", label: `Upstreams ${data.upstreams.length}` },
                { value: "links", label: `Links ${data.links.length}` },
                { value: "sets", label: `Upstream sets ${data.sets.length}` },
              ]}
            />
          )}
          <FilterField value={filter} onChange={setFilter} className="ml-1" />
          <Spacer />
          <Button variant="primary" onClick={() => openDialog("create-upstream", { connectionId: cid })} {...mutating(cid)} disabled={readOnly || data === null}>
            <Plus />
            New upstream
          </Button>
        </ViewToolbar>
      }
      inspector={
        upstream ? (
          <Inspector label="Upstream" title={upstream.name} subtitle="Federation upstream" actions={
            <>
              <Button size="sm" variant="ghost" disabled={readOnly} title={readOnly ? READ_ONLY_REASON : "Edit upstream"} onClick={() => edit(upstream)}>
                <Pencil />
                Edit
              </Button>
              <Button size="sm" variant="ghost" disabled={readOnly} title={readOnly ? READ_ONLY_REASON : "Delete upstream"} onClick={() => void remove(upstream, "upstream")}>
                <Trash2 />
              </Button>
            </>
          }>
            <KeyValues rows={[["Vhost", upstream.vhost]]} />
            <SectionHeader>Definition</SectionHeader>
            <JsonView value={maskDeep(upstream.value)} defaultDepth={3} className="px-3 pb-2" />
            <SectionHeader>Links · {(data?.links ?? []).filter((l) => l.vhost === upstream.vhost && l.upstream === upstream.name).length}</SectionHeader>
            <div className="pb-2">
              {(data?.links ?? [])
                .filter((l) => l.vhost === upstream.vhost && l.upstream === upstream.name)
                .map((l) => (
                  <div key={linkKey(l)} className="px-3 py-0.5 text-sm">
                    <StateLabel tone={stateTone(l.status)}>{l.status}</StateLabel>
                    <span className="ml-2 font-mono text-[12px]">{l.exchange ?? l.queue}</span>
                    {l.error && <div className="truncate text-xs text-danger" title={l.error}>{l.error}</div>}
                  </div>
                ))}
            </div>
          </Inspector>
        ) : link ? (
          <Inspector label="Link" title={link.exchange ?? link.queue ?? link.upstream} subtitle={`${link.type} link via ${link.upstream}`}>
            <KeyValues
              rows={[
                ["Status", <StateLabel key="s" tone={stateTone(link.status)}>{link.status}</StateLabel>],
                ["Vhost", link.vhost],
                ["Upstream", link.upstream],
                ["Node", shortNode(link.node)],
                ["URI", link.uri ? maskUri(link.uri) : "–"],
                ["Upstream object", link.upstream_exchange ?? link.upstream_queue ?? "–"],
                ["Since", link.timestamp ?? "–"],
              ]}
            />
            {link.error && (
              <>
                <SectionHeader>Error</SectionHeader>
                <div className="px-3 pb-2 font-mono text-[12px] break-words text-danger">{link.error}</div>
              </>
            )}
          </Inspector>
        ) : set ? (
          <Inspector label="Upstream set" title={set.name} subtitle="Federation upstream set" actions={
            <Button size="sm" variant="ghost" disabled={readOnly} title={readOnly ? READ_ONLY_REASON : "Delete upstream set"} onClick={() => void remove(set, "upstream set")}>
              <Trash2 />
              Delete
            </Button>
          }>
            <KeyValues rows={[["Vhost", set.vhost]]} />
            <SectionHeader>Definition</SectionHeader>
            <JsonView value={set.value} defaultDepth={3} className="px-3 pb-2" />
          </Inspector>
        ) : null
      }
    >
      {live.error && data === undefined ? (
        <ErrorState error={live.error} onRetry={() => void live.refresh()} />
      ) : data === undefined ? (
        <Loading />
      ) : data === null ? (
        <PluginOff plugin="federation" extra="rabbitmq_federation rabbitmq_federation_management" />
      ) : show === "upstreams" ? (
        <DataTable
          aria-label="Federation upstreams"
          rows={upstreams}
          columns={upstreamColumns}
          rowKey={upstreamKey}
          selected={selected}
          onSelectionChange={(keys) => setSelected(keys)}
          onOpen={readOnly ? undefined : edit}
          menu={upstreamMenu}
          reveal={tab.focus ? upstreams.find((p) => p.name === tab.focus) && upstreamKey(upstreams.find((p) => p.name === tab.focus)!) : null}
          defaultSort={{ column: "name", desc: false }}
          empty={filter ? "No upstreams match." : "No upstreams. Add one to federate exchanges or queues from another broker."}
        />
      ) : show === "links" ? (
        <DataTable
          aria-label="Federation links"
          rows={links}
          columns={linkColumns}
          rowKey={linkKey}
          selected={selected}
          onSelectionChange={(keys) => setSelected(keys)}
          defaultSort={{ column: "status", desc: false }}
          empty={filter ? "No links match." : "No links. Links start once a policy federates an exchange or queue to an upstream."}
        />
      ) : (
        <DataTable
          aria-label="Federation upstream sets"
          rows={sets}
          columns={setColumns}
          rowKey={upstreamKey}
          selected={selected}
          onSelectionChange={(keys) => setSelected(keys)}
          menu={setMenu}
          defaultSort={{ column: "name", desc: false }}
          empty={filter ? "No upstream sets match." : "No upstream sets."}
        />
      )}
    </SectionFrame>
  );
}
