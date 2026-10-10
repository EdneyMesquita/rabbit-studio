import { useCallback, useMemo, useState } from "react";
import { Flag } from "lucide-react";
import { DataTable, type Column } from "@/components/data/DataTable";
import { Inspector } from "@/components/data/Inspector";
import { ErrorState, FilterField, KeyValues, Loading, Notice, SectionHeader, Spacer, StateLabel, Tag, ViewTitle, ViewToolbar, type Tone } from "@/components/data/parts";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useLive } from "@/hooks/useLive";
import { rabbit } from "@/lib/rabbit/client";
import { confirmDestructive, isReadOnly } from "@/lib/rabbit/guard";
import { int } from "@/lib/rabbit/format";
import { paths } from "@/lib/rabbit/paths";
import type { FeatureFlag } from "@/types/rabbit";
import { READ_ONLY_REASON, SectionFrame, mutate, type SectionProps } from "../shared";

interface Deprecated {
  name: string;
  desc?: string;
  /** 4.x: permitted, denied, disconnected, removed... */
  deprecation_phase?: string;
  /** 4.2: permitted or denied. */
  state?: string;
  provided_by?: string;
  doc_url?: string;
}

interface Loaded {
  flags: FeatureFlag[];
  deprecated: Deprecated[];
}

async function load(cid: string): Promise<Loaded> {
  const api = rabbit(cid);
  const [flags, deprecated] = await Promise.all([
    api.get<FeatureFlag[]>(paths.featureFlags),
    api.get<Deprecated[]>(paths.deprecatedFeatures).catch(() => [] as Deprecated[]),
  ]);
  return { flags, deprecated };
}

const flagTone = (state: string): Tone => (state === "enabled" ? "ok" : state === "disabled" ? "idle" : "warn");
const canEnable = (f: FeatureFlag) => f.state === "disabled" && f.stability === "stable";

export default function FlagsSection({ cid, shown }: SectionProps) {
  const live = useLive<Loaded>(`${cid}:admin:flags`, () => load(cid), { enabled: shown });
  const [show, setShow] = useState<"flags" | "deprecated">("flags");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const readOnly = isReadOnly(cid);

  const enable = useCallback(
    async (f: FeatureFlag) => {
      const ok = await confirmDestructive(cid, {
        title: `Enable feature flag ${f.name}`,
        message: `It is enabled on every node of the cluster at once and cannot be undone. Nodes that don't support it can no longer join the cluster.`,
        confirmLabel: "Enable",
      });
      if (ok) await mutate(cid, () => rabbit(cid).put(paths.featureFlagEnable(f.name), {}), "Feature flag enabled", f.name);
    },
    [cid],
  );

  const flags = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const all = live.data?.flags ?? [];
    return f ? all.filter((x) => x.name.toLowerCase().includes(f) || x.desc.toLowerCase().includes(f) || x.provided_by.includes(f)) : all;
  }, [live.data, filter]);
  const deprecated = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const all = live.data?.deprecated ?? [];
    return f ? all.filter((x) => x.name.toLowerCase().includes(f)) : all;
  }, [live.data, filter]);

  const flagColumns = useMemo<Column<FeatureFlag>[]>(
    () => [
      { id: "name", header: "Name", width: 270, cell: (f) => f.name, sortValue: (f) => f.name },
      { id: "state", header: "State", width: 120, mono: false, cell: (f) => <StateLabel tone={flagTone(f.state)}>{f.state}</StateLabel>, sortValue: (f) => f.state },
      { id: "stability", header: "Stability", width: 110, cell: (f) => <Tag>{f.stability}</Tag>, sortValue: (f) => f.stability },
      { id: "desc", header: "Description", mono: false, cell: (f) => <span className="text-fg-2">{f.desc}</span> },
      { id: "by", header: "Provided by", width: 200, cell: (f) => f.provided_by, sortValue: (f) => f.provided_by },
      {
        id: "enable",
        header: "",
        width: 80,
        mono: false,
        cell: (f) =>
          canEnable(f) ? (
            <Button size="sm" className="h-5" disabled={readOnly} title={readOnly ? READ_ONLY_REASON : "Enable on every node; it cannot be undone"} onClick={() => void enable(f)}>
              Enable
            </Button>
          ) : null,
      },
    ],
    [readOnly, enable],
  );
  const deprecatedColumns = useMemo<Column<Deprecated>[]>(
    () => [
      { id: "name", header: "Name", width: 270, cell: (d) => d.name, sortValue: (d) => d.name },
      { id: "phase", header: "Phase", width: 190, cell: (d) => d.deprecation_phase ?? "–", sortValue: (d) => d.deprecation_phase },
      { id: "state", header: "State", width: 120, mono: false, cell: (d) => (d.state ? <StateLabel tone={d.state === "permitted" ? "warn" : "idle"}>{d.state.replace("_", " ")}</StateLabel> : "–"), sortValue: (d) => d.state },
      { id: "desc", header: "Description", mono: false, cell: (d) => <span className="text-fg-2">{d.desc || "–"}</span> },
      { id: "by", header: "Provided by", width: 200, cell: (d) => d.provided_by ?? "–", sortValue: (d) => d.provided_by },
    ],
    [],
  );

  const current = selected.size === 1 && show === "flags" ? (live.data?.flags ?? []).find((f) => f.name === [...selected][0]) : undefined;

  return (
    <SectionFrame
      toolbar={
        <ViewToolbar>
          <ViewTitle icon={Flag} name="Feature flags" kind={`${int(live.data?.flags.length ?? 0)} flags`} />
          <SegmentedControl<"flags" | "deprecated">
            aria-label="What to list"
            value={show}
            onChange={(s) => {
              setShow(s);
              setSelected(new Set());
            }}
            options={[
              { value: "flags", label: `Feature flags ${live.data?.flags.length ?? ""}` },
              { value: "deprecated", label: `Deprecated features ${live.data?.deprecated.length ?? ""}` },
            ]}
          />
          <FilterField value={filter} onChange={setFilter} className="ml-1" />
          <Spacer />
        </ViewToolbar>
      }
      notice={
        <Notice tone="info">
          {show === "flags" ? (
            <>Enabling a feature flag is irreversible and happens on every node at once.</>
          ) : (
            <>Deprecated features the broker still permits or has already turned off.</>
          )}
        </Notice>
      }
      inspector={current ? <FlagInspector flag={current} readOnly={readOnly} onEnable={enable} /> : null}
    >
      {live.error && !live.data ? (
        <ErrorState error={live.error} onRetry={() => void live.refresh()} />
      ) : !live.data ? (
        <Loading />
      ) : show === "flags" ? (
        <DataTable
          aria-label="Feature flags"
          rows={flags}
          columns={flagColumns}
          rowKey={(f) => f.name}
          selected={selected}
          onSelectionChange={(keys) => setSelected(keys)}
          defaultSort={{ column: "name", desc: false }}
          empty={filter ? "No feature flags match." : "No feature flags."}
        />
      ) : (
        <DataTable
          aria-label="Deprecated features"
          rows={deprecated}
          columns={deprecatedColumns}
          rowKey={(d) => d.name}
          defaultSort={{ column: "name", desc: false }}
          empty={filter ? "No deprecated features match." : "This broker lists no deprecated features."}
        />
      )}
    </SectionFrame>
  );
}

function FlagInspector({ flag, readOnly, onEnable }: { flag: FeatureFlag; readOnly: boolean; onEnable: (f: FeatureFlag) => Promise<void> }) {
  return (
    <Inspector label="Feature flag" title={flag.name} subtitle="Feature flag">
      <KeyValues
        rows={[
          ["State", <StateLabel key="s" tone={flagTone(flag.state)}>{flag.state}</StateLabel>],
          ["Stability", flag.stability],
          ["Provided by", flag.provided_by],
          ...(flag.doc_url ? ([["Docs", flag.doc_url]] as [string, string][]) : []),
        ]}
      />
      <SectionHeader>Description</SectionHeader>
      <div className="px-3 pb-2 text-sm text-fg-2">{flag.desc || "No description."}</div>
      {canEnable(flag) ? (
        <div className="px-3 pb-3">
          <Button variant="primary" disabled={readOnly} title={readOnly ? READ_ONLY_REASON : undefined} onClick={() => void onEnable(flag)}>
            Enable
          </Button>
          <div className="pt-1.5 text-xs text-fg-3">Enabled on every node at once; it cannot be undone.</div>
        </div>
      ) : flag.state === "disabled" ? (
        <div className="px-3 pb-3 text-xs text-fg-3">A {flag.stability} flag cannot be enabled from here.</div>
      ) : null}
    </Inspector>
  );
}
