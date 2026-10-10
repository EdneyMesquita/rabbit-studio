import { memo, useCallback, useMemo, useState } from "react";
import { Inbox, Pencil, Plus, Shield, Split, Trash2 } from "lucide-react";
import { TypedTree } from "@/components/data/TypedTree";
import { DataTable, type Column } from "@/components/data/DataTable";
import { Inspector } from "@/components/data/Inspector";
import { ErrorState, FilterField, KeyValues, Loading, SectionHeader, Spacer, ViewTitle, ViewToolbar } from "@/components/data/parts";
import type { MenuEntry } from "@/components/common/ActionMenu";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useLive } from "@/hooks/useLive";
import { rabbit } from "@/lib/rabbit/client";
import { confirmDestructive, isReadOnly } from "@/lib/rabbit/guard";
import { int } from "@/lib/rabbit/format";
import { paths, withQuery } from "@/lib/rabbit/paths";
import { openDialog } from "@/store/dialogStore";
import type { Page, Policy } from "@/types/rabbit";
import { definitionSummary, policyMatches, type Named } from "../adminLogic";
import { READ_ONLY_REASON, SectionFrame, mutate, mutating, type SectionProps } from "../shared";

type Kind = "user" | "operator";

const keyOf = (p: Policy) => `${p.vhost}\u0000${p.name}`;

async function load(cid: string): Promise<{ user: Policy[]; operator: Policy[] }> {
  const api = rabbit(cid);
  const [user, operator] = await Promise.all([
    api.get<Policy[]>(paths.policies()),
    api.get<Policy[]>(paths.operatorPolicies()).catch(() => [] as Policy[]),
  ]);
  return { user, operator };
}

export default function PoliciesSection({ cid, tab, shown }: SectionProps) {
  const live = useLive(`${cid}:admin:policies`, () => load(cid), { enabled: shown });
  const [kind, setKind] = useState<Kind>("user");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const readOnly = isReadOnly(cid);
  const operator = kind === "operator";

  const list = live.data?.[kind];
  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const all = list ?? [];
    return f ? all.filter((p) => p.name.toLowerCase().includes(f) || p.vhost.toLowerCase().includes(f) || p.pattern.toLowerCase().includes(f)) : all;
  }, [list, filter]);

  const columns = useMemo<Column<Policy>[]>(
    () => [
      { id: "vhost", header: "vhost", width: 130, cell: (p) => <span className="text-fg-2">{p.vhost}</span>, sortValue: (p) => p.vhost },
      { id: "name", header: "name", width: 190, cell: (p) => p.name, sortValue: (p) => p.name },
      { id: "pattern", header: "pattern", width: 220, cell: (p) => <span className="text-json-string">{p.pattern}</span>, sortValue: (p) => p.pattern },
      { id: "apply", header: "apply to", width: 120, cell: (p) => p["apply-to"], sortValue: (p) => p["apply-to"] },
      { id: "priority", header: "priority", align: "right", width: 80, cell: (p) => p.priority, sortValue: (p) => p.priority },
      { id: "definition", header: "definition", cell: (p) => definitionSummary(p.definition) },
    ],
    [],
  );

  const edit = useCallback((p: Policy) => openDialog("create-policy", { connectionId: cid, vhost: p.vhost, name: p.name, data: { policy: p, operator } }), [cid, operator]);

  const remove = useCallback(
    async (p: Policy) => {
      const ok = await confirmDestructive(cid, {
        title: `Delete ${operator ? "operator " : ""}policy ${p.name}`,
        guard: p.name,
        message: `Queues and exchanges in ${p.vhost} matching ${p.pattern} lose what this policy gave them, immediately.`,
        confirmLabel: "Delete policy",
      });
      if (!ok) return;
      const done = await mutate(cid, () => rabbit(cid).del(operator ? paths.operatorPolicy(p.vhost, p.name) : paths.policy(p.vhost, p.name)), "Policy deleted", `${p.name} on ${p.vhost}`);
      if (done) setSelected(new Set());
    },
    [cid, operator],
  );

  const menu = useCallback(
    (p: Policy): MenuEntry[] => [
      { label: "Edit policy", icon: Pencil, disabled: readOnly, onSelect: () => edit(p) },
      { separator: true },
      { label: "Delete policy", icon: Trash2, danger: true, disabled: readOnly, onSelect: () => void remove(p) },
    ],
    [readOnly, edit, remove],
  );

  const current = selected.size === 1 ? (list ?? []).find((p) => keyOf(p) === [...selected][0]) : undefined;
  const focusKey = useMemo(() => (tab.focus ? (list ?? []).find((p) => p.name === tab.focus)?.vhost : undefined), [tab.focus, list]);

  return (
    <SectionFrame
      toolbar={
        <ViewToolbar>
          <ViewTitle icon={Shield} name="Policies" kind={`${int(live.data?.user.length ?? 0)} user · ${int(live.data?.operator.length ?? 0)} operator`} />
          <SegmentedControl<Kind>
            aria-label="Kind of policy"
            value={kind}
            onChange={(k) => {
              setKind(k);
              setSelected(new Set());
            }}
            options={[
              { value: "user", label: "User policies" },
              { value: "operator", label: "Operator policies" },
            ]}
          />
          <FilterField value={filter} onChange={setFilter} placeholder="Filter by name, vhost or pattern" className="ml-1" />
          <Spacer />
          <Button variant="secondary" onClick={() => openDialog("create-policy", { connectionId: cid, data: { operator } })} {...mutating(cid)}>
            <Plus />
            New {operator ? "operator policy" : "policy"}
          </Button>
        </ViewToolbar>
      }
      inspector={
        current ? (
          <PolicyInspector key={`${kind}:${keyOf(current)}`} cid={cid} policy={current} operator={operator} shown={shown} readOnly={readOnly} onEdit={edit} onDelete={remove} />
        ) : null
      }
    >
      {live.error && !live.data ? (
        <ErrorState error={live.error} onRetry={() => void live.refresh()} />
      ) : !live.data ? (
        <Loading />
      ) : (
        <DataTable
selectFirst
          aria-label={operator ? "Operator policies" : "Policies"}
          rows={rows}
          columns={columns}
          rowKey={keyOf}
          selected={selected}
          onSelectionChange={(keys) => setSelected(keys)}
          onOpen={readOnly ? undefined : edit}
          menu={menu}
          reveal={focusKey != null && tab.focus ? `${focusKey}\u0000${tab.focus}` : null}
          defaultSort={{ column: "name", desc: false }}
          empty={filter ? "No policies match." : operator ? "No operator policies." : "No policies."}
        />
      )}
    </SectionFrame>
  );
}

/** Names only, the first page of 500 of a vhost: enough to preview a pattern. */
const PREVIEW_PAGE = 500;

interface Candidates {
  queues: Named[];
  exchanges: Named[];
  /** More than one page exists: the preview is partial. */
  partial: boolean;
}

async function candidates(cid: string, vhost: string): Promise<Candidates> {
  const api = rabbit(cid);
  const [q, e] = await Promise.all([
    api.get<Page<Named>>(withQuery(paths.queues(vhost), { columns: "name,type", page: 1, page_size: PREVIEW_PAGE })),
    api.get<Page<Named>>(withQuery(paths.exchanges(vhost), { columns: "name", page: 1, page_size: PREVIEW_PAGE })),
  ]);
  return { queues: q.items, exchanges: e.items, partial: q.page_count > 1 || e.page_count > 1 };
}

const PolicyInspector = memo(function PolicyInspector({
  cid,
  policy,
  operator,
  shown,
  readOnly,
  onEdit,
  onDelete,
}: {
  cid: string;
  policy: Policy;
  operator: boolean;
  shown: boolean;
  readOnly: boolean;
  onEdit: (p: Policy) => void;
  onDelete: (p: Policy) => void;
}) {
  const cand = useLive(`${cid}:admin:policy-match:${policy.vhost}`, () => candidates(cid, policy.vhost), { interval: 0, enabled: shown });
  const matches = useMemo(
    () => (cand.data ? policyMatches(policy.pattern, policy["apply-to"], cand.data.queues, cand.data.exchanges) : null),
    [cand.data, policy.pattern, policy],
  );
  const total = matches ? matches.queues.length + matches.exchanges.length : 0;

  return (
    <Inspector
      label="Policy"
      title={policy.name}
      subtitle={operator ? "Operator policy" : "Policy"}
      actions={
        <>
          <Button size="sm" variant="ghost" disabled={readOnly} title={readOnly ? READ_ONLY_REASON : "Edit policy"} onClick={() => onEdit(policy)}>
            <Pencil />
            Edit
          </Button>
          <Button size="sm" variant="ghost" disabled={readOnly} title={readOnly ? READ_ONLY_REASON : "Delete policy"} onClick={() => onDelete(policy)}>
            <Trash2 />
          </Button>
        </>
      }
    >
      <KeyValues
        rows={[
          ["vhost", policy.vhost],
          ["pattern", policy.pattern],
          ["apply to", policy["apply-to"]],
          ["priority", String(policy.priority)],
        ]}
      />
      <SectionHeader>Definition</SectionHeader>
      <TypedTree value={policy.definition} open={3} />
      <SectionHeader>{matches ? `Applies to · ${total}` : "Applies to"}</SectionHeader>
      <div className="pb-2">
        {cand.error && !cand.data ? (
          <div className="px-3 text-sm text-danger">{cand.error}</div>
        ) : !matches ? (
          <div className="px-3 text-sm text-fg-3">Checking…</div>
        ) : matches.invalid ? (
          <div className="px-3 text-sm text-fg-3">The pattern is not a regular expression this preview can test.</div>
        ) : total === 0 ? (
          <div className="px-3 text-sm text-fg-3">Nothing matches right now.</div>
        ) : (
          <>
            {matches.queues.slice(0, 200).map((n) => (
              <div key={`q${n}`} className="flex items-center gap-2 px-3 py-0.5 font-mono text-[12px]">
                <Inbox className="size-3.5 shrink-0 text-fg-3" aria-hidden />
                <span className="truncate">{n}</span>
              </div>
            ))}
            {matches.exchanges.slice(0, 200).map((n) => (
              <div key={`e${n}`} className="flex items-center gap-2 px-3 py-0.5 font-mono text-[12px]">
                <Split className="size-3.5 shrink-0 text-fg-3" aria-hidden />
                <span className="truncate">{n}</span>
              </div>
            ))}
          </>
        )}
        {cand.data?.partial && <div className="px-3 pt-1 text-xs text-fg-3">Preview covers the first {PREVIEW_PAGE} queues and exchanges.</div>}
      </div>
      <div className="border-t border-line-soft px-3 py-2 text-xs text-fg-3">Changes apply to matching objects immediately.</div>
    </Inspector>
  );
});
