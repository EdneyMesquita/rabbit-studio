import { useState } from "react";
import { Download, FileJson, Upload } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Notice, ViewTitle, ViewToolbar } from "@/components/data/parts";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invalidate } from "@/hooks/useLive";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { confirmDestructive, isReadOnly } from "@/lib/rabbit/guard";
import { int } from "@/lib/rabbit/format";
import { api } from "@/lib/tauri";
import { definitionCounts } from "../adminLogic";
import { Field, READ_ONLY_REASON, useVhostNames, type SectionProps } from "../shared";

const ALL = "\u0000all";

/** One of the page's blocks: a tinted header strip over a flat body. */
function Panel({ icon: Icon, title, meta, children }: { icon: typeof Download; title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="max-w-[760px] rounded-md border border-line">
      <header className="flex items-center gap-2 rounded-t-md border-b border-line bg-panel px-3 py-2">
        <Icon className="size-3.5 text-fg-3" aria-hidden />
        <h3 className="text-base font-semibold text-fg">{title}</h3>
        {meta && <span className="truncate text-sm text-fg-3">{meta}</span>}
      </header>
      <div className="flex flex-col gap-3 p-3">{children}</div>
    </section>
  );
}

function ScopeSelect({ id, value, onChange, vhosts }: { id: string; value: string; onChange: (v: string) => void; vhosts: string[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-64 font-mono text-[12px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Whole broker</SelectItem>
        {vhosts.map((v) => (
          <SelectItem key={v} value={v}>
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface Chosen {
  path: string;
  counts: { label: string; count: number }[];
}

export default function DefinitionsSection({ cid, tab, shown }: SectionProps) {
  const vhosts = useVhostNames(cid, shown);
  const readOnly = isReadOnly(cid);
  const [exportScope, setExportScope] = useState(ALL);
  const [importScope, setImportScope] = useState(ALL);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const doExport = async () => {
    const vhost = exportScope === ALL ? null : exportScope;
    const base = `${(tab.connection?.name ?? "broker").replace(/[^\w.-]+/g, "-")}${vhost ? `-${vhost.replace(/[^\w.-]+/g, "-") || "default"}` : ""}-definitions.json`;
    try {
      const path = await save({ defaultPath: base, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (!path) return;
      setBusy("export");
      await api.exportDefinitions(rabbit(cid).sessionId(), vhost, path);
      toast.success("Definitions exported", { description: path });
    } catch (e) {
      toast.error("Could not export", { description: errorText(e) });
    } finally {
      setBusy(null);
    }
  };

  const choose = async () => {
    setProblem(null);
    try {
      const path = await open({ multiple: false, directory: false, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (typeof path !== "string") return;
      const text = await api.readTextFile(path);
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        setChosen(null);
        setProblem("That file is not valid JSON.");
        return;
      }
      const counts = definitionCounts(json);
      if (counts.length === 0) {
        setChosen(null);
        setProblem("That file has no definitions in it (no users, vhosts, queues, exchanges, bindings or policies).");
        return;
      }
      setChosen({ path, counts });
    } catch (e) {
      setChosen(null);
      setProblem(errorText(e));
    }
  };

  const doImport = async () => {
    if (!chosen) return;
    const vhost = importScope === ALL ? null : importScope;
    const ok = await confirmDestructive(cid, {
      title: "Import definitions",
      message: `${chosen.counts.map((c) => `${int(c.count)} ${c.label.toLowerCase()}`).join(", ")} are merged into ${vhost ? `vhost ${vhost}` : "the broker"}. Anything with the same name is overwritten; nothing is deleted.`,
      confirmLabel: "Import",
    });
    if (!ok) return;
    setBusy("import");
    try {
      await api.importDefinitions(rabbit(cid).sessionId(), vhost, chosen.path);
      invalidate(`${cid}:`);
      toast.success("Definitions imported", { description: chosen.path });
      setChosen(null);
    } catch (e) {
      toast.error("Could not import", { description: errorText(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <ViewToolbar>
        <ViewTitle icon={FileJson} name="Definitions" kind="export and import the broker's topology" />
      </ViewToolbar>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-[22px] pt-[18px] pb-7">
        <Panel icon={Download} title="Export" meta="users, vhosts, permissions, policies, exchanges, queues, bindings. No messages.">
          <Field label="Scope" htmlFor="def-export-scope">
            <ScopeSelect id="def-export-scope" value={exportScope} onChange={setExportScope} vhosts={vhosts} />
          </Field>
          <div>
            <Button variant="primary" disabled={busy !== null} onClick={() => void doExport()}>
              <Download />
              {busy === "export" ? "Exporting…" : "Export JSON"}
            </Button>
          </div>
        </Panel>

        <Panel icon={Upload} title="Import" meta="merges with what exists; nothing is deleted">
          <Field label="Into" htmlFor="def-import-scope" help={importScope === ALL ? undefined : "Only what belongs to this vhost is imported."}>
            <ScopeSelect id="def-import-scope" value={importScope} onChange={setImportScope} vhosts={vhosts} />
          </Field>
          <button
            type="button"
            disabled={readOnly || busy !== null}
            title={readOnly ? READ_ONLY_REASON : undefined}
            onClick={() => void choose()}
            className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-field-line p-5 text-center text-sm text-fg-2 hover:bg-row-hover disabled:opacity-50"
          >
            <FileJson className="size-5 text-fg-3" aria-hidden />
            <span>
              {chosen ? "Choose another definitions file" : "Choose a definitions file"} <span className="text-accent-text">(.json)</span>
            </span>
          </button>
          {problem && <Notice tone="crit">{problem}</Notice>}
          {chosen && (
            <div className="flex flex-col gap-2">
              <div className="truncate font-mono text-[12px] text-fg-2" title={chosen.path}>
                {chosen.path}
              </div>
              <dl className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-px overflow-hidden rounded-sm border border-line bg-line">
                {chosen.counts.map((c) => (
                  <div key={c.label} className="bg-editor px-2.5 py-1.5">
                    <dt className="text-xs text-fg-3">{c.label}</dt>
                    <dd className="font-mono text-[13px] font-medium tabular-nums text-fg">{int(c.count)}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <Button variant="primary" disabled={readOnly || busy !== null} title={readOnly ? READ_ONLY_REASON : undefined} onClick={() => void doImport()}>
                  <Upload />
                  {busy === "import" ? "Importing…" : "Import"}
                </Button>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
