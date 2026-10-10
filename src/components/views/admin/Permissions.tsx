import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionHeader } from "@/components/data/parts";
import { rabbit } from "@/lib/rabbit/client";
import { confirmDestructive } from "@/lib/rabbit/guard";
import { paths } from "@/lib/rabbit/paths";
import type { Permission, TopicPermission } from "@/types/rabbit";
import { READ_ONLY_REASON, mutate } from "./shared";

const cell = "h-6 min-w-0 px-1.5 font-mono text-[12px]";

/** The three regexes of one grant, editable; Save shows once they differ. */
function RegexRow({
  label,
  values,
  readOnly,
  onSave,
  onClear,
  clearTitle,
  fields = ["configure", "write", "read"],
  lockFirst = false,
}: {
  fields?: [string, string, string];
  /** The first value names the grant (a topic permission's exchange): not editable. */
  lockFirst?: boolean;
  label: string;
  values: [string, string, string];
  readOnly: boolean;
  onSave: (v: [string, string, string]) => void;
  onClear: () => void;
  clearTitle: string;
}) {
  const [v, setV] = useState(values);
  const [seen, setSeen] = useState(values.join("\u0000"));
  if (seen !== values.join("\u0000")) {
    setSeen(values.join("\u0000"));
    setV(values);
  }
  const dirty = v.some((x, i) => x !== values[i]);
  const set = (i: number, x: string) => setV((p) => p.map((y, j) => (j === i ? x : y)) as [string, string, string]);
  return (
    <div className="border-t border-line-soft px-3 py-1.5 first:border-t-0">
      <div className="mb-1 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium text-fg">{label}</span>
        {dirty && (
          <Button size="sm" variant="primary" disabled={readOnly} title={readOnly ? READ_ONLY_REASON : undefined} onClick={() => onSave(v)}>
            Save
          </Button>
        )}
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={clearTitle}
          title={readOnly ? READ_ONLY_REASON : clearTitle}
          disabled={readOnly}
          onClick={onClear}
        >
          <Trash2 />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {fields.map((k, i) => (
          <Input
            key={k}
            value={v[i]}
            aria-label={`${label} ${k}`}
            placeholder={k}
            title={k}
            disabled={readOnly || (lockFirst && i === 0)}
            className={cell}
            onChange={(e) => set(i, e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && dirty && onSave(v)}
          />
        ))}
      </div>
    </div>
  );
}

/** Picks one of `options` and grants it the default `.*` triple. */
function AddRow({
  noun,
  options,
  readOnly,
  onAdd,
}: {
  noun: string;
  options: string[];
  readOnly: boolean;
  onAdd: (choice: string) => void;
}) {
  const [choice, setChoice] = useState("");
  if (options.length === 0) return null;
  return (
    <div className="flex items-center gap-2 border-t border-line-soft px-3 py-1.5">
      <Select value={choice} onValueChange={setChoice} disabled={readOnly}>
        <SelectTrigger size="sm" className="min-w-0 flex-1 font-mono text-[12px]" aria-label={`${noun} to grant`}>
          <SelectValue placeholder={`Grant on ${noun}…`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        disabled={readOnly || !choice}
        title={readOnly ? READ_ONLY_REASON : "Grant .* on configure, write and read"}
        onClick={() => {
          onAdd(choice);
          setChoice("");
        }}
      >
        Grant
      </Button>
    </div>
  );
}

/**
 * The permissions of one user across vhosts (`fixed.user`) or of one vhost
 * across users (`fixed.vhost`): set, change and clear.
 */
export function PermissionsEditor({
  cid,
  perms,
  fixed,
  options,
  readOnly,
}: {
  cid: string;
  perms: Permission[];
  fixed: { user: string } | { vhost: string };
  /** The other dimension's names, for granting a new one. */
  options: string[];
  readOnly: boolean;
}) {
  const byUser = "user" in fixed;
  const identity = (p: Permission) => (byUser ? p.vhost : p.user);
  const target = (other: string) =>
    byUser ? { vhost: other, user: (fixed as { user: string }).user } : { vhost: (fixed as { vhost: string }).vhost, user: other };
  const free = options.filter((o) => !perms.some((p) => identity(p) === o));
  const save = (other: string, v: [string, string, string]) => {
    const t = target(other);
    return mutate(cid, () => rabbit(cid).put(paths.permission(t.vhost, t.user), { configure: v[0], write: v[1], read: v[2] }), "Permissions saved", `${t.user} on ${t.vhost}`);
  };
  return (
    <>
      <SectionHeader>Permissions · {perms.length}</SectionHeader>
      {perms.length === 0 && <div className="px-3 pb-2 text-sm text-fg-3">{byUser ? "No access to any vhost." : "No user can access it."}</div>}
      {perms.map((p) => (
        <RegexRow
          key={`${p.vhost}\u0000${p.user}`}
          label={identity(p)}
          values={[p.configure, p.write, p.read]}
          readOnly={readOnly}
          clearTitle={`Clear permissions of ${p.user} on ${p.vhost}`}
          onSave={(v) => void save(identity(p), v)}
          onClear={async () => {
            const ok = await confirmDestructive(cid, {
              title: "Clear permissions",
              message: `${p.user} will lose access to vhost ${p.vhost}; its open connections there are closed.`,
              confirmLabel: "Clear",
            });
            if (ok) await mutate(cid, () => rabbit(cid).del(paths.permission(p.vhost, p.user)), "Permissions cleared", `${p.user} on ${p.vhost}`);
          }}
        />
      ))}
      <AddRow noun={byUser ? "vhost" : "user"} options={free} readOnly={readOnly} onAdd={(o) => void save(o, [".*", ".*", ".*"])} />
    </>
  );
}

/** A user's topic permissions: exchange, write and read regexes per vhost. */
export function TopicPermissionsEditor({
  cid,
  user,
  perms,
  vhosts,
  readOnly,
}: {
  cid: string;
  user: string;
  perms: TopicPermission[];
  vhosts: string[];
  readOnly: boolean;
}) {
  const [vhost, setVhost] = useState("");
  const [exchange, setExchange] = useState("amq.topic");
  const put = (vh: string, ex: string, write: string, read: string) =>
    mutate(cid, () => rabbit(cid).put(paths.topicPermission(vh, user), { exchange: ex, write, read }), "Topic permissions saved", `${user} on ${vh} / ${ex}`);
  return (
    <>
      <SectionHeader>Topic permissions · {perms.length}</SectionHeader>
      {perms.length === 0 && <div className="px-3 pb-1 text-sm text-fg-3">None set: topic exchanges don't restrict routing keys for this user.</div>}
      {perms.map((p) => (
        <RegexRow
          key={`${p.vhost}\u0000${p.exchange}`}
          label={`${p.vhost} / ${p.exchange}`}
          fields={["exchange", "write", "read"]}
          lockFirst
          values={[p.exchange, p.write, p.read]}
          readOnly={readOnly}
          clearTitle={`Clear topic permissions of ${user} on ${p.vhost}`}
          onSave={(v) => void put(p.vhost, v[0], v[1], v[2])}
          onClear={async () => {
            const ok = await confirmDestructive(cid, {
              title: "Clear topic permissions",
              message: `This clears every topic permission of ${user} on vhost ${p.vhost}, for all exchanges.`,
              confirmLabel: "Clear",
            });
            if (ok) await mutate(cid, () => rabbit(cid).del(paths.topicPermission(p.vhost, user)), "Topic permissions cleared", `${user} on ${p.vhost}`);
          }}
        />
      ))}
      <div className="flex items-center gap-2 border-t border-line-soft px-3 py-1.5">
        <Select value={vhost} onValueChange={setVhost} disabled={readOnly}>
          <SelectTrigger size="sm" className="w-32 shrink-0 font-mono text-[12px]" aria-label="Vhost for the topic permission">
            <SelectValue placeholder="Vhost…" />
          </SelectTrigger>
          <SelectContent>
            {vhosts.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={exchange}
          aria-label="Exchange"
          placeholder="exchange"
          disabled={readOnly}
          className={`${cell} flex-1`}
          onChange={(e) => setExchange(e.target.value)}
        />
        <Button
          size="sm"
          disabled={readOnly || !vhost || !exchange.trim()}
          title={readOnly ? READ_ONLY_REASON : "Grant .* on write and read"}
          onClick={() => void put(vhost, exchange.trim(), ".*", ".*")}
        >
          Grant
        </Button>
      </div>
    </>
  );
}
