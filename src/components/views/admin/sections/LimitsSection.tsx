import { useMemo, useState } from "react";
import { Gauge, Plus } from "lucide-react";
import { DataTable, type Column } from "@/components/data/DataTable";
import { ErrorState, FilterField, Loading, Spacer, ViewTitle, ViewToolbar } from "@/components/data/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLive } from "@/hooks/useLive";
import { rabbit } from "@/lib/rabbit/client";
import { isReadOnly } from "@/lib/rabbit/guard";
import { int } from "@/lib/rabbit/format";
import { paths, withQuery } from "@/lib/rabbit/paths";
import type { UserLimits, VHostLimits } from "@/types/rabbit";
import { READ_ONLY_REASON, SectionFrame, mutate, mutating, type SectionProps } from "../shared";

type Scope = "vhost" | "user";
type LimitName = "max-connections" | "max-queues" | "max-channels";

interface LimitRow {
  scope: Scope;
  target: string;
  limit: LimitName;
  value: number;
}

const LIMITS: Record<Scope, LimitName[]> = {
  vhost: ["max-connections", "max-queues"],
  user: ["max-connections", "max-channels"],
};

const keyOf = (r: LimitRow) => `${r.scope}\u0000${r.target}\u0000${r.limit}`;

interface Loaded {
  rows: LimitRow[];
  vhosts: string[];
  users: string[];
}

async function load(cid: string): Promise<Loaded> {
  const api = rabbit(cid);
  const [vl, ul, vhosts, users] = await Promise.all([
    api.get<VHostLimits[]>(paths.vhostLimits).catch(() => [] as VHostLimits[]),
    api.get<UserLimits[]>(paths.userLimits).catch(() => [] as UserLimits[]),
    api.get<{ name: string }[]>(withQuery(paths.vhosts, { columns: "name" })),
    api.get<{ name: string }[]>(withQuery(paths.users, { columns: "name" })),
  ]);
  const rows: LimitRow[] = [
    ...vl.flatMap((l) => Object.entries(l.value).map(([k, v]) => ({ scope: "vhost" as const, target: l.vhost, limit: k as LimitName, value: v as number }))),
    ...ul.flatMap((l) => Object.entries(l.value).map(([k, v]) => ({ scope: "user" as const, target: l.user, limit: k as LimitName, value: v as number }))),
  ];
  return { rows, vhosts: vhosts.map((v) => v.name).sort(), users: users.map((u) => u.name).sort() };
}

function limitPath(scope: Scope, target: string, limit: LimitName): string {
  return scope === "vhost" ? paths.vhostLimit(target, limit as "max-connections" | "max-queues") : paths.userLimit(target, limit as "max-connections" | "max-channels");
}

/** Edits one limit where it stands: Enter or Set saves, Clear removes it. */
function LimitCell({ cid, row, readOnly }: { cid: string; row: LimitRow; readOnly: boolean }) {
  const [text, setText] = useState(String(row.value));
  const [seen, setSeen] = useState(row.value);
  if (seen !== row.value) {
    setSeen(row.value);
    setText(String(row.value));
  }
  const n = Number(text);
  const valid = text.trim() !== "" && Number.isInteger(n) && n >= -1;
  const set = () => mutate(cid, () => rabbit(cid).put(limitPath(row.scope, row.target, row.limit), { value: n }), "Limit set", `${row.target} ${row.limit} = ${n}`);
  return (
    <span className="inline-flex items-center gap-1 font-sans">
      <Input
        value={text}
        inputMode="numeric"
        aria-label={`${row.target} ${row.limit}`}
        disabled={readOnly}
        className="h-5 w-24 px-1.5 text-right font-mono text-[12px]"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Keys here are for the field, not the table's row navigation.
          e.stopPropagation();
          if (e.key === "Enter" && valid && n !== row.value) void set();
        }}
      />
      <Button size="sm" className="h-5" disabled={readOnly || !valid || n === row.value} title={readOnly ? READ_ONLY_REASON : undefined} onClick={() => void set()}>
        Set
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-5"
        disabled={readOnly}
        title={readOnly ? READ_ONLY_REASON : "Remove the limit"}
        onClick={() => void mutate(cid, () => rabbit(cid).del(limitPath(row.scope, row.target, row.limit)), "Limit cleared", `${row.target} ${row.limit}`)}
      >
        Clear
      </Button>
    </span>
  );
}

export default function LimitsSection({ cid, shown }: SectionProps) {
  const live = useLive<Loaded>(`${cid}:admin:limits`, () => load(cid), { enabled: shown });
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const readOnly = isReadOnly(cid);

  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const all = live.data?.rows ?? [];
    return f ? all.filter((r) => r.target.toLowerCase().includes(f) || r.limit.includes(f) || r.scope.includes(f)) : all;
  }, [live.data, filter]);

  const columns = useMemo<Column<LimitRow>[]>(
    () => [
      { id: "scope", header: "scope", width: 90, cell: (r) => r.scope, sortValue: (r) => r.scope },
      { id: "target", header: "target", width: 220, cell: (r) => r.target, sortValue: (r) => r.target },
      { id: "limit", header: "limit", width: 160, cell: (r) => r.limit, sortValue: (r) => r.limit },
      { id: "value", header: "max", align: "right", width: 90, cell: (r) => int(r.value), sortValue: (r) => r.value },
      { id: "edit", header: "change", mono: false, cell: (r) => <LimitCell cid={cid} row={r} readOnly={readOnly} /> },
    ],
    [cid, readOnly],
  );

  return (
    <SectionFrame
      toolbar={
        <ViewToolbar>
          <ViewTitle icon={Gauge} name="Limits" kind={`${int(live.data?.rows.length ?? 0)} set`} />
          <FilterField value={filter} onChange={setFilter} placeholder="Filter by target or limit" className="ml-2" />
          <Spacer />
          <Button variant="secondary" aria-pressed={adding} onClick={() => setAdding((a) => !a)} {...mutating(cid)}>
            <Plus />
            New limit
          </Button>
        </ViewToolbar>
      }
      notice={adding && live.data ? <AddLimit cid={cid} vhosts={live.data.vhosts} users={live.data.users} onDone={() => setAdding(false)} /> : null}
    >
      {live.error && !live.data ? (
        <ErrorState error={live.error} onRetry={() => void live.refresh()} />
      ) : !live.data ? (
        <Loading />
      ) : (
        <DataTable
selectFirst
          aria-label="Limits"
          rows={rows}
          columns={columns}
          rowKey={keyOf}
          defaultSort={{ column: "scope", desc: false }}
          empty={filter ? "No limits match." : "No limits are set. Vhost limits cap connections and queues; user limits cap connections and channels."}
        />
      )}
    </SectionFrame>
  );
}

/** The bar that sets a limit that doesn't exist yet. */
function AddLimit({ cid, vhosts, users, onDone }: { cid: string; vhosts: string[]; users: string[]; onDone: () => void }) {
  const [scope, setScope] = useState<Scope>("vhost");
  const [target, setTarget] = useState("");
  const [limit, setLimit] = useState<LimitName>("max-connections");
  const [text, setText] = useState("");
  const n = Number(text);
  const valid = !!target && text.trim() !== "" && Number.isInteger(n) && n >= -1;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-1.5">
      <SegmentedControl<Scope>
        aria-label="Scope"
        value={scope}
        onChange={(s) => {
          setScope(s);
          setTarget("");
          if (!LIMITS[s].includes(limit)) setLimit("max-connections");
        }}
        options={[
          { value: "vhost", label: "Vhost" },
          { value: "user", label: "User" },
        ]}
      />
      <Select value={target} onValueChange={setTarget}>
        <SelectTrigger size="sm" className="w-48 font-mono text-[12px]" aria-label="Target">
          <SelectValue placeholder={scope === "vhost" ? "Vhost…" : "User…"} />
        </SelectTrigger>
        <SelectContent>
          {(scope === "vhost" ? vhosts : users).map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={limit} onValueChange={(l) => setLimit(l as LimitName)}>
        <SelectTrigger size="sm" className="w-40 font-mono text-[12px]" aria-label="Limit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LIMITS[scope].map((l) => (
            <SelectItem key={l} value={l}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input value={text} inputMode="numeric" placeholder="max" aria-label="Maximum" className="h-7 w-24 font-mono text-[12px]" onChange={(e) => setText(e.target.value)} />
      <Button
        variant="primary"
        disabled={!valid}
        onClick={async () => {
          if (await mutate(cid, () => rabbit(cid).put(limitPath(scope, target, limit), { value: n }), "Limit set", `${target} ${limit} = ${n}`)) onDone();
        }}
      >
        Set limit
      </Button>
      <Button variant="ghost" onClick={onDone}>
        Cancel
      </Button>
      <span className="text-xs text-fg-3">-1 means no limit; 0 refuses everything.</span>
    </div>
  );
}
