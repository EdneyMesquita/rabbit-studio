import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { invalidate } from "@/hooks/useLive";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { paths } from "@/lib/rabbit/paths";
import type { Policy, PolicyApplyTo } from "@/types/rabbit";
import type { DialogProps } from "../../types";
import { POLICY_KEYS, policyKey, policyText, policyValue } from "../adminLogic";
import { Field, FieldRow, useVhostNames } from "../shared";

const APPLY_TO: { value: PolicyApplyTo; label: string }[] = [
  { value: "all", label: "all (queues and exchanges)" },
  { value: "queues", label: "queues (every type)" },
  { value: "classic_queues", label: "classic_queues" },
  { value: "quorum_queues", label: "quorum_queues" },
  { value: "streams", label: "streams" },
  { value: "exchanges", label: "exchanges" },
];

interface Row {
  id: number;
  key: string;
  value: string;
}

/** A definition as editable rows. */
function rowsOf(def: Record<string, unknown>, next: () => number): Row[] {
  return Object.entries(def).map(([key, v]) => ({ id: next(), key, value: policyText(v) }));
}

export default function CreatePolicyDialog({ context, onClose }: DialogProps) {
  const cid = context.connectionId;
  const operator = context.data?.operator === true;
  const editing = (context.data?.policy as Policy | undefined) ?? null;
  const vhostNames = useVhostNames(cid);
  const ids = useRef(0);
  const nextId = () => ++ids.current;

  const [name, setName] = useState(editing?.name ?? "");
  const [vhostPick, setVhost] = useState(editing?.vhost ?? context.vhost ?? "");
  const vhost = vhostPick || (vhostNames.includes("/") ? "/" : (vhostNames[0] ?? ""));
  const [pattern, setPattern] = useState(editing?.pattern ?? "");
  const [applyTo, setApplyTo] = useState<PolicyApplyTo>(editing?.["apply-to"] ?? "queues");
  const [priority, setPriority] = useState(String(editing?.priority ?? 0));
  const [rows, setRows] = useState<Row[]>(() => (editing ? rowsOf(editing.definition, nextId) : []));
  const [mode, setMode] = useState<"form" | "json">("form");
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const presets = useMemo(() => POLICY_KEYS.filter((k) => !operator || k.operator), [operator]);
  const unused = presets.filter((k) => !rows.some((r) => r.key === k.key));
  const patternBad = useMemo(() => {
    try {
      new RegExp(pattern);
      return false;
    } catch {
      return true;
    }
  }, [pattern]);

  /** The definition the rows stand for; says what is wrong when they don't make one. */
  const build = (): { def: Record<string, unknown> } | { problem: string } => {
    const def: Record<string, unknown> = {};
    for (const r of rows) {
      const key = r.key.trim();
      if (!key) continue;
      if (key in def) return { problem: `${key} is set twice.` };
      if (r.value.trim() === "") return { problem: `Give ${key} a value.` };
      def[key] = policyValue(key, r.value);
    }
    return { def };
  };

  const switchMode = (next: "form" | "json") => {
    if (next === mode) return;
    if (next === "json") {
      const b = build();
      setRaw(JSON.stringify("def" in b ? b.def : {}, null, 2));
      setError(null);
      setMode("json");
      return;
    }
    try {
      const parsed: unknown = JSON.parse(raw || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("The definition must be a JSON object.");
      setRows(rowsOf(parsed as Record<string, unknown>, nextId));
      setError(null);
      setMode("form");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That is not valid JSON.");
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError("Give the policy a name.");
    if (!vhost) return setError("Choose a virtual host.");
    if (!pattern) return setError("Give a pattern; .* matches everything.");
    const prio = Number(priority);
    if (!Number.isInteger(prio)) return setError("Priority is a whole number.");
    let definition: Record<string, unknown>;
    if (mode === "json") {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("The definition must be a JSON object.");
        definition = parsed as Record<string, unknown>;
      } catch (err) {
        return setError(err instanceof Error ? err.message : "That is not valid JSON.");
      }
    } else {
      const b = build();
      if ("problem" in b) return setError(b.problem);
      definition = b.def;
    }
    if (Object.keys(definition).length === 0) return setError("Add at least one setting to the definition.");

    setBusy(true);
    setError(null);
    const api = rabbit(cid);
    const path = operator ? paths.operatorPolicy(vhost, n) : paths.policy(vhost, n);
    if (!editing) {
      // PUT on an existing policy replaces it, so look first.
      const exists = await api.get(path).then(
        () => true,
        () => false,
      );
      if (exists) {
        setBusy(false);
        return setError(`A policy named ${n} already exists in ${vhost}. Edit that one instead.`);
      }
    }
    try {
      await api.put(path, { pattern, definition, priority: prio, "apply-to": applyTo });
    } catch (err) {
      setBusy(false);
      return setError(errorText(err));
    }
    invalidate(`${cid}:`);
    toast.success(editing ? "Policy updated" : "Policy created", { description: `${n} on ${vhost}` });
    onClose();
  };

  const title = `${editing ? "Edit" : "New"} ${operator ? "operator policy" : "policy"}`;

  return (
    <Modal
      title={title}
      onClose={onClose}
      width="max-w-xl"
      footer={
        <>
          <span className="mr-auto text-xs text-fg-3">Changes apply to matching objects immediately.</span>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="create-policy" disabled={busy}>
            {busy ? "Saving…" : editing ? "Save policy" : "Create policy"}
          </Button>
        </>
      }
    >
      <form id="create-policy" className="flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
        <FieldRow>
          <Field label="Name" htmlFor="pol-name">
            <Input id="pol-name" autoFocus={!editing} disabled={!!editing} className="font-mono" placeholder="billing-dlx" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Virtual host">
            <Select value={vhost} onValueChange={setVhost} disabled={!!editing}>
              <SelectTrigger className="w-full font-mono text-[12px]" aria-label="Virtual host">
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                {(vhostNames.length ? vhostNames : vhost ? [vhost] : []).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldRow>
        <Field label="Pattern" htmlFor="pol-pattern" help={patternBad ? <span className="text-warn">This does not look like a regular expression the browser can read; the broker decides.</span> : "A regular expression matched against queue and exchange names."}>
          <Input id="pol-pattern" className="font-mono" placeholder="^billing\." value={pattern} onChange={(e) => setPattern(e.target.value)} />
        </Field>
        <FieldRow>
          <Field label="Apply to">
            <Select value={applyTo} onValueChange={(v) => setApplyTo(v as PolicyApplyTo)}>
              <SelectTrigger className="w-full font-mono text-[12px]" aria-label="Apply to">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPLY_TO.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Priority" htmlFor="pol-priority" help="The highest priority matching an object is the one that applies.">
            <Input id="pol-priority" inputMode="numeric" className="font-mono" value={priority} onChange={(e) => setPriority(e.target.value)} />
          </Field>
        </FieldRow>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-fg">Definition</span>
          <SegmentedControl<"form" | "json">
            aria-label="Definition editor"
            value={mode}
            onChange={switchMode}
            options={[
              { value: "form", label: "Settings" },
              { value: "json", label: "JSON" },
            ]}
          />
        </div>
        {operator && <div className="-mt-1.5 text-xs text-fg-3">Operator policies accept only limits: TTLs, lengths, delivery limit and the like.</div>}

        {mode === "json" ? (
          <Textarea aria-label="Definition JSON" spellCheck={false} rows={8} className="max-h-72 resize-y font-mono text-[12px]" value={raw} onChange={(e) => setRaw(e.target.value)} />
        ) : (
          <div className="flex flex-col gap-1.5">
            {rows.map((r) => {
              const spec = policyKey(r.key);
              const set = (patch: Partial<Row>) => setRows((p) => p.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
              return (
                <div key={r.id} className="flex items-center gap-2">
                  {spec ? (
                    <span className="w-56 shrink-0 truncate font-mono text-[12px] text-fg" title={spec.hint ? `${r.key}: ${spec.hint}` : r.key}>
                      {r.key}
                    </span>
                  ) : (
                    <Input aria-label="Key" placeholder="key" className="h-7 w-56 shrink-0 font-mono text-[12px]" value={r.key} onChange={(e) => set({ key: e.target.value })} />
                  )}
                  {spec?.type === "enum" ? (
                    <Select value={r.value} onValueChange={(v) => set({ value: v })}>
                      <SelectTrigger size="sm" className="min-w-0 flex-1 font-mono text-[12px]" aria-label={r.key}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {spec.options!.map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      aria-label={r.key || "Value"}
                      placeholder={spec?.hint ?? "value"}
                      inputMode={spec?.type === "number" ? "numeric" : undefined}
                      className="h-7 min-w-0 flex-1 font-mono text-[12px]"
                      value={r.value}
                      onChange={(e) => set({ value: e.target.value })}
                    />
                  )}
                  <Button type="button" size="icon-xs" variant="ghost" aria-label={`Remove ${r.key || "setting"}`} onClick={() => setRows((p) => p.filter((x) => x.id !== r.id))}>
                    <X />
                  </Button>
                </div>
              );
            })}
            {rows.length === 0 && <div className="text-sm text-fg-3">No settings yet. Add what the policy should apply.</div>}
            <div className="flex items-center gap-2 pt-0.5">
              <Select
                value=""
                onValueChange={(k) => {
                  const spec = policyKey(k)!;
                  setRows((p) => [...p, { id: nextId(), key: k, value: spec.type === "enum" ? spec.options![0] : "" }]);
                }}
              >
                <SelectTrigger size="sm" className="w-64 font-mono text-[12px]" aria-label="Add a setting">
                  <SelectValue placeholder="Add a setting…" />
                </SelectTrigger>
                <SelectContent>
                  {unused.map((k) => (
                    <SelectItem key={k.key} value={k.key}>
                      {k.key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" size="sm" onClick={() => setRows((p) => [...p, { id: nextId(), key: "", value: "" }])}>
                <Plus />
                Custom key
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="text-sm text-danger">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
