import { memo, useCallback, useMemo, useState } from "react";
import { Layers, Plus, Trash2 } from "lucide-react";
import { DataTable, type Column } from "@/components/data/DataTable";
import { Inspector } from "@/components/data/Inspector";
import { ErrorState, FilterField, KeyValues, Loading, SectionHeader, Spacer, StateLabel, Tag, ViewTitle, ViewToolbar, Dash } from "@/components/data/parts";
import type { MenuEntry } from "@/components/common/ActionMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { useLive } from "@/hooks/useLive";
import { rabbit } from "@/lib/rabbit/client";
import { confirmDestructive, isReadOnly } from "@/lib/rabbit/guard";
import { int, rate, shortNode } from "@/lib/rabbit/format";
import { openOn } from "@/lib/rabbit/nav";
import { paths, withQuery } from "@/lib/rabbit/paths";
import { openDialog } from "@/store/dialogStore";
import type { Permission, VHost, VHostLimits } from "@/types/rabbit";
import { tagsOf } from "../adminLogic";
import { PermissionsEditor } from "../Permissions";
import { Field, LimitEditor, READ_ONLY_REASON, SectionFrame, TagChips, mutate, mutating, type SectionProps } from "../shared";

type Vhost = VHost & { protected_from_deletion?: boolean };

interface VhostRow {
  v: Vhost;
  name: string;
  tags: string[];
  /** "classic" when the broker doesn't say (3.13 answers "undefined"). */
  queueType: string;
  perms: Permission[];
  limits: VHostLimits["value"];
}

const COLUMNS = [
  "name",
  "description",
  "tags",
  "default_queue_type",
  "tracing",
  "messages",
  "messages_ready",
  "messages_unacknowledged",
  "message_stats.publish_details.rate",
  "message_stats.deliver_get_details.rate",
  "cluster_state",
  "protected_from_deletion",
].join(",");

const keyOf = (r: VhostRow) => r.name;

async function load(cid: string): Promise<VhostRow[]> {
  const api = rabbit(cid);
  const [vhosts, perms, limits] = await Promise.all([
    api.get<Vhost[]>(withQuery(paths.vhosts, { columns: COLUMNS })),
    api.get<Permission[]>(paths.permissions),
    api.get<VHostLimits[]>(paths.vhostLimits).catch(() => [] as VHostLimits[]),
  ]);
  const l = new Map(limits.map((x) => [x.vhost, x.value]));
  return vhosts.map((v) => ({
    v,
    name: v.name,
    tags: tagsOf(v.tags ?? v.metadata?.tags),
    queueType: v.default_queue_type && v.default_queue_type !== "undefined" ? v.default_queue_type : "classic",
    perms: perms.filter((p) => p.vhost === v.name),
    limits: l.get(v.name) ?? {},
  }));
}

/** A vhost PUT replaces everything it doesn't carry (tracing included): always send all of it. */
function putVhost(cid: string, row: VhostRow, patch: { description?: string; tags?: string[]; default_queue_type?: string; tracing?: boolean }) {
  return rabbit(cid).put(paths.vhost(row.name), {
    description: patch.description ?? row.v.description ?? row.v.metadata?.description ?? "",
    tags: patch.tags ?? row.tags,
    default_queue_type: patch.default_queue_type ?? row.queueType,
    tracing: patch.tracing ?? row.v.tracing ?? false,
  });
}

function clusterState(v: Vhost): { tone: "ok" | "warn" | "idle"; text: string } {
  const states = Object.values(v.cluster_state ?? {});
  if (!states.length) return { tone: "idle", text: "–" };
  const up = states.filter((s) => s === "running").length;
  return { tone: up === states.length ? "ok" : "warn", text: up === states.length ? `running ${up}/${states.length}` : `${up}/${states.length} running` };
}

export default function VhostsSection({ cid, tab, shown }: SectionProps) {
  const live = useLive<VhostRow[]>(`${cid}:admin:vhosts`, () => load(cid), { enabled: shown });
  // Queues per vhost: one page of one row each, read for its filtered_count.
  const vhostNames = useMemo(() => (live.data ?? []).map((r) => r.name).join("\u0000"), [live.data]);
  const queueCounts = useLive<Record<string, number>>(
    vhostNames ? `${cid}:admin:vhost-queue-counts:${vhostNames}` : null,
    async () => {
      const names = vhostNames.split("\u0000");
      const pages = await Promise.all(
        names.map((v) => rabbit(cid).get<{ filtered_count: number }>(withQuery(paths.queues(v), { columns: "name", page: 1, page_size: 1 }))),
      );
      return Object.fromEntries(names.map((v, i) => [v, pages[i]?.filtered_count ?? 0]));
    },
    { interval: 30_000, enabled: shown },
  );
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const readOnly = isReadOnly(cid);

  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const all = live.data ?? [];
    return f ? all.filter((r) => r.name.toLowerCase().includes(f) || (r.v.description ?? "").toLowerCase().includes(f)) : all;
  }, [live.data, filter]);

  const columns = useMemo<Column<VhostRow>[]>(
    () => [
      { id: "name", header: "name", width: 150, cell: (r) => r.name, sortValue: (r) => r.name },
      { id: "description", header: "description", width: 180, mono: false, cell: (r) => r.v.description || r.v.metadata?.description || <Dash />, sortValue: (r) => r.v.description },
      { id: "type", header: "queue type", width: 96, cell: (r) => r.queueType, sortValue: (r) => r.queueType },
      { id: "queues", header: "queues", align: "right", width: 72, cell: (r) => (queueCounts.data?.[r.name] == null ? <Dash /> : int(queueCounts.data[r.name])), sortValue: (r) => queueCounts.data?.[r.name] },
      { id: "ready", header: "ready", align: "right", width: 84, cell: (r) => int(r.v.messages_ready), sortValue: (r) => r.v.messages_ready },
      { id: "unacked", header: "unacked", align: "right", width: 90, cell: (r) => int(r.v.messages_unacknowledged), sortValue: (r) => r.v.messages_unacknowledged },
      { id: "total", header: "total", align: "right", width: 90, cell: (r) => int(r.v.messages), sortValue: (r) => r.v.messages },
      {
        id: "tags",
        header: "tags",
        width: 140,
        cell: (r) => (r.tags.length ? <span className="inline-flex gap-1">{r.tags.map((t) => <Tag key={t}>{t}</Tag>)}</span> : <Dash />),
      },
      {
        id: "in",
        header: "publish",
        align: "right",
        width: 90,
        cell: (r) => rate(r.v.message_stats?.publish_details?.rate),
        sortValue: (r) => r.v.message_stats?.publish_details?.rate,
      },
      {
        id: "out",
        header: "deliver",
        align: "right",
        width: 90,
        cell: (r) => rate(r.v.message_stats?.deliver_get_details?.rate),
        sortValue: (r) => r.v.message_stats?.deliver_get_details?.rate,
      },
      {
        id: "state",
        header: "cluster state",
        width: 140,
        mono: false,
        cell: (r) => {
          const s = clusterState(r.v);
          return <StateLabel tone={s.tone}>{s.text}</StateLabel>;
        },
      },
    ],
    [queueCounts.data],
  );

  const deleteVhost = useCallback(
    async (r: VhostRow) => {
      const ok = await confirmDestructive(cid, {
        title: `Delete virtual host ${r.name}`,
        guard: r.name,
        message: `Every queue, exchange, binding, policy and message in ${r.name} is deleted, and its connections are closed. This cannot be undone.`,
        confirmLabel: "Delete virtual host",
      });
      if (ok && (await mutate(cid, () => rabbit(cid).del(paths.vhost(r.name)), "Virtual host deleted", r.name))) setSelected(new Set());
    },
    [cid],
  );

  const menu = useCallback(
    (r: VhostRow): MenuEntry[] => [
      { label: "Open queues", onSelect: () => openOn(cid, { kind: "queues", vhost: r.name }) },
      { separator: true },
      {
        label: "Delete virtual host",
        icon: Trash2,
        danger: true,
        disabled: readOnly || r.v.protected_from_deletion,
        onSelect: () => void deleteVhost(r),
      },
    ],
    [cid, readOnly, deleteVhost],
  );

  const current = selected.size === 1 ? (live.data ?? []).find((r) => r.name === [...selected][0]) : undefined;

  return (
    <SectionFrame
      toolbar={
        <ViewToolbar>
          <ViewTitle icon={Layers} name="Virtual hosts" kind={`${int(live.data?.length ?? 0)} in total`} />
          <FilterField value={filter} onChange={setFilter} placeholder="Filter by name or description" className="ml-2" />
          <Spacer />
          <Button variant="secondary" onClick={() => openDialog("create-vhost", { connectionId: cid })} {...mutating(cid)}>
            <Plus />
            New virtual host
          </Button>
        </ViewToolbar>
      }
      inspector={current ? <VhostInspector key={current.name} cid={cid} row={current} readOnly={readOnly} onDelete={deleteVhost} /> : null}
    >
      {live.error && !live.data ? (
        <ErrorState error={live.error} onRetry={() => void live.refresh()} />
      ) : !live.data ? (
        <Loading />
      ) : (
        <DataTable
selectFirst
          aria-label="Virtual hosts"
          rows={rows}
          columns={columns}
          rowKey={keyOf}
          selected={selected}
          onSelectionChange={(keys) => setSelected(keys)}
          onOpen={(r) => openOn(cid, { kind: "queues", vhost: r.name })}
          menu={menu}
          reveal={tab.focus}
          defaultSort={{ column: "name", desc: false }}
          empty={filter ? "No virtual hosts match." : "No virtual hosts."}
        />
      )}
    </SectionFrame>
  );
}

const QUEUE_TYPES = ["classic", "quorum", "stream"].map((t) => ({ value: t, label: t }));

const VhostInspector = memo(function VhostInspector({
  cid,
  row,
  readOnly,
  onDelete,
}: {
  cid: string;
  row: VhostRow;
  readOnly: boolean;
  onDelete: (r: VhostRow) => void;
}) {
  const [description, setDescription] = useState(row.v.description ?? row.v.metadata?.description ?? "");
  const [tags, setTags] = useState(row.tags);
  const [type, setType] = useState(row.queueType);
  const users = useLive<{ name: string }[]>(`${cid}:admin:user-names`, () => rabbit(cid).get(withQuery(paths.users, { columns: "name" })), { interval: 0 });
  const dirty = description !== (row.v.description ?? row.v.metadata?.description ?? "") || tags.join(",") !== row.tags.join(",") || type !== row.queueType;
  const state = clusterState(row.v);
  const protectedVhost = !!row.v.protected_from_deletion;

  return (
    <Inspector
      label="Virtual host"
      title={row.name}
      subtitle="Virtual host"
      actions={
        <Button
          size="sm"
          variant="ghost"
          disabled={readOnly || protectedVhost}
          title={readOnly ? READ_ONLY_REASON : protectedVhost ? "Protected from deletion" : "Delete virtual host"}
          onClick={() => onDelete(row)}
        >
          <Trash2 />
          Delete
        </Button>
      }
    >
      <KeyValues
        rows={[
          ["cluster state", <StateLabel key="s" tone={state.tone}>{state.text}</StateLabel>],
          ["nodes", Object.keys(row.v.cluster_state ?? {}).map(shortNode).join(", ") || <Dash />],
          ["protected", protectedVhost ? "yes" : "no"],
        ]}
      />

      <SectionHeader
        actions={
          dirty && (
            <Button
              size="sm"
              variant="primary"
              disabled={readOnly}
              title={readOnly ? READ_ONLY_REASON : undefined}
              onClick={() => void mutate(cid, () => putVhost(cid, row, { description, tags, default_queue_type: type }), "Virtual host updated", row.name)}
            >
              Save
            </Button>
          )
        }
      >
        Settings
      </SectionHeader>
      <div className="flex flex-col gap-3 px-3 pb-3">
        <Field label="Description" htmlFor="vh-desc">
          <Input id="vh-desc" value={description} disabled={readOnly} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Tags">
          <TagChips value={tags} onChange={setTags} suggestions={[]} disabled={readOnly} />
        </Field>
        <Field label="Default queue type" help="Used for queues declared without an x-queue-type.">
          <SegmentedControl aria-label="Default queue type" value={type} onChange={setType} options={QUEUE_TYPES} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-fg">
          <Switch
            size="sm"
            checked={row.v.tracing ?? false}
            disabled={readOnly}
            onCheckedChange={(tracing) => void mutate(cid, () => putVhost(cid, row, { tracing }), tracing ? "Tracing on" : "Tracing off", row.name)}
          />
          Tracing
          <span className="text-xs text-fg-3">firehose of every message; costly on a busy vhost</span>
        </label>
      </div>

      <PermissionsEditor cid={cid} perms={row.perms} fixed={{ vhost: row.name }} options={(users.data ?? []).map((u) => u.name)} readOnly={readOnly} />

      <SectionHeader>Limits</SectionHeader>
      <div className="pb-2">
        {(["max-connections", "max-queues"] as const).map((k) => (
          <LimitEditor
            key={k}
            label={k}
            value={row.limits[k]}
            readOnly={readOnly}
            onSet={(value) => void mutate(cid, () => rabbit(cid).put(paths.vhostLimit(row.name, k), { value }), "Limit set", `${row.name} ${k} = ${value}`)}
            onClear={() => void mutate(cid, () => rabbit(cid).del(paths.vhostLimit(row.name, k)), "Limit cleared", `${row.name} ${k}`)}
          />
        ))}
      </div>
    </Inspector>
  );
});
