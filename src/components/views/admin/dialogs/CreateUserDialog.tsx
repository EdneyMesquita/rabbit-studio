import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invalidate } from "@/hooks/useLive";
import { errorText, rabbit } from "@/lib/rabbit/client";
import { openOn } from "@/lib/rabbit/nav";
import { paths } from "@/lib/rabbit/paths";
import type { DialogProps } from "../../types";
import { Field, FieldRow, TagChips, useVhostNames } from "../shared";

const NONE = "\u0000none";

export default function CreateUserDialog({ context, onClose }: DialogProps) {
  const cid = context.connectionId;
  const vhosts = useVhostNames(cid);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [noPassword, setNoPassword] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [vhost, setVhost] = useState(NONE);
  const [perms, setPerms] = useState<[string, string, string]>([".*", ".*", ".*"]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = !noPassword && confirm.length > 0 && password !== confirm;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError("Give the user a name.");
    if (!noPassword && !password) return setError("Set a password, or choose to create the user without one.");
    if (mismatch) return setError("The passwords differ.");
    setBusy(true);
    setError(null);
    const api = rabbit(cid);
    // PUT on an existing user replaces its password and tags, so look first.
    const exists = await api.get(paths.user(n)).then(
      () => true,
      () => false,
    );
    if (exists) {
      setBusy(false);
      return setError(`A user named ${n} already exists.`);
    }
    try {
      await api.put(paths.user(n), noPassword ? { password_hash: "", tags } : { password, tags });
    } catch (err) {
      setBusy(false);
      return setError(errorText(err));
    }
    if (vhost !== NONE) {
      try {
        await api.put(paths.permission(vhost, n), { configure: perms[0], write: perms[1], read: perms[2] });
      } catch (err) {
        toast.warning(`Created ${n}, but could not grant access to ${vhost}`, { description: errorText(err) });
      }
    }
    invalidate(`${cid}:`);
    toast.success("User created", { description: vhost !== NONE ? `${n} · access to ${vhost}` : n });
    openOn(cid, { kind: "admin", section: "users", focus: n });
    onClose();
  };

  return (
    <Modal
      title="New user"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="create-user" disabled={busy}>
            {busy ? "Creating…" : "Create user"}
          </Button>
        </>
      }
    >
      <form id="create-user" className="flex flex-col gap-3" onSubmit={(e) => void submit(e)} autoComplete="off">
        <Field label="Username" htmlFor="user-name">
          <Input id="user-name" autoFocus className="font-mono" placeholder="billing-svc" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <FieldRow>
          <Field label="Password" htmlFor="user-password">
            <Input id="user-password" type="password" autoComplete="new-password" disabled={noPassword} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm password" htmlFor="user-confirm">
            <Input
              id="user-confirm"
              type="password"
              autoComplete="new-password"
              disabled={noPassword}
              value={confirm}
              aria-invalid={mismatch ? true : undefined}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </FieldRow>
        <label className="flex items-center gap-2 text-sm text-fg-2">
          <Checkbox checked={noPassword} onCheckedChange={(c) => setNoPassword(c === true)} />
          No password (the user can only log in through another mechanism, such as a certificate)
        </label>
        <Field label="Tags">
          <TagChips value={tags} onChange={setTags} />
        </Field>
        <Field label="Initial access" help="Grants this user the vhost permissions below. Change them later from the user.">
          <Select value={vhost} onValueChange={setVhost}>
            <SelectTrigger className="w-full font-mono text-[12px]" aria-label="Vhost">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No vhost access yet</SelectItem>
              {vhosts.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {vhost !== NONE && (
          <div className="grid grid-cols-3 gap-2">
            {["configure", "write", "read"].map((k, i) => (
              <Field key={k} label={k} htmlFor={`perm-${k}`}>
                <Input id={`perm-${k}`} className="font-mono text-[12px]" value={perms[i]} onChange={(e) => setPerms((p) => p.map((x, j) => (j === i ? e.target.value : x)) as [string, string, string])} />
              </Field>
            ))}
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
