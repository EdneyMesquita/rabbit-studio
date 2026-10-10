import { memo, useCallback, useMemo, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { DataTable, type Column } from "@/components/data/DataTable";
import { Inspector } from "@/components/data/Inspector";
import { EmptyState, ErrorState, FilterField, Loading, SectionHeader, Spacer, Tag, ViewTitle, ViewToolbar } from "@/components/data/parts";
import type { MenuEntry } from "@/components/common/ActionMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLive } from "@/hooks/useLive";
import { rabbit } from "@/lib/rabbit/client";
import { confirmDestructive, isReadOnly } from "@/lib/rabbit/guard";
import { int } from "@/lib/rabbit/format";
import { paths } from "@/lib/rabbit/paths";
import { useConnectionsStore } from "@/store/connectionsStore";
import { openDialog } from "@/store/dialogStore";
import type { Permission, TopicPermission, User, UserLimits } from "@/types/rabbit";
import { tagsOf } from "../adminLogic";
import { PermissionsEditor, TopicPermissionsEditor } from "../Permissions";
import { LimitEditor, READ_ONLY_REASON, SectionFrame, TagChips, mutate, mutating, useVhostNames, type SectionProps } from "../shared";

interface UserRow {
  name: string;
  tags: string[];
  hasPassword: boolean;
  hash: string;
  algorithm: string;
  perms: Permission[];
  tperms: TopicPermission[];
  limits: Record<string, number>;
}

const keyOf = (r: UserRow) => r.name;

/** Users joined with their grants and limits, from four small lists. */
async function load(cid: string): Promise<UserRow[]> {
  const api = rabbit(cid);
  const [users, perms, tperms, limits] = await Promise.all([
    api.get<User[]>(paths.users),
    api.get<Permission[]>(paths.permissions),
    api.get<TopicPermission[]>(paths.topicPermissions),
    api.get<UserLimits[]>(paths.userLimits).catch(() => [] as UserLimits[]),
  ]);
  const group = <T extends { user: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of list) (m.get(x.user) ?? m.set(x.user, []).get(x.user)!).push(x);
    return m;
  };
  const p = group(perms);
  const t = group(tperms);
  const l = new Map(limits.map((x) => [x.user, x.value]));
  return users.map((u) => ({
    name: u.name,
    tags: tagsOf(u.tags),
    hasPassword: !!u.password_hash,
    hash: u.password_hash ?? "",
    algorithm: u.hashing_algorithm ?? "",
    perms: p.get(u.name) ?? [],
    tperms: t.get(u.name) ?? [],
    limits: l.get(u.name) ?? u.limits ?? {},
  }));
}

/** PUT a user keeping what the patch doesn't change: a tags-only PUT would wipe the password. */
function putUser(cid: string, row: UserRow, patch: { tags?: string[]; password?: string; removePassword?: boolean }) {
  const body: Record<string, unknown> = { tags: patch.tags ?? row.tags };
  if (patch.password !== undefined) body.password = patch.password;
  else if (patch.removePassword) body.password_hash = "";
  else {
    body.password_hash = row.hash;
    if (row.algorithm) body.hashing_algorithm = row.algorithm;
  }
  return rabbit(cid).put(paths.user(row.name), body);
}

export default function UsersSection({ cid, tab, shown }: SectionProps) {
  const live = useLive<UserRow[]>(`${cid}:admin:users`, () => load(cid), { enabled: shown });
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const readOnly = isReadOnly(cid);
  const vhosts = useVhostNames(cid, shown);
  const me = useConnectionsStore.getState().sessions[cid]?.user;

  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const all = live.data ?? [];
    return f ? all.filter((r) => r.name.toLowerCase().includes(f) || r.tags.some((t) => t.includes(f))) : all;
  }, [live.data, filter]);

  const columns = useMemo<Column<UserRow>[]>(
    () => [
      { id: "name", header: "Name", width: 190, cell: (r) => r.name, sortValue: (r) => r.name },
      {
        id: "tags",
        header: "Tags",
        width: 230,
        cell: (r) =>
          r.tags.length ? (
            <span className="inline-flex gap-1">
              {r.tags.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </span>
          ) : (
            <span className="text-fg-3">none</span>
          ),
        sortValue: (r) => r.tags.join(","),
      },
      {
        id: "vhosts",
        header: "Can access vhosts",
        cell: (r) => (r.perms.length ? r.perms.map((p) => p.vhost).join(", ") : <span className="text-fg-3">none</span>),
        sortValue: (r) => r.perms.length,
      },
      {
        id: "password",
        header: "Password",
        width: 90,
        mono: false,
        cell: (r) => (r.hasPassword ? "set" : <span className="text-fg-3">none</span>),
        sortValue: (r) => (r.hasPassword ? 1 : 0),
      },
      {
        id: "limits",
        header: "Limits",
        width: 190,
        cell: (r) => {
          const e = Object.entries(r.limits);
          return e.length ? e.map(([k, v]) => `${k.replace("max-", "")} ${int(v)}`).join(", ") : <span className="text-fg-3">none</span>;
        },
      },
    ],
    [],
  );

  const deleteUsers = useCallback(
    async (names: string[]) => {
      const mine = me && names.includes(me);
      const ok = await confirmDestructive(cid, {
        title: names.length === 1 ? `Delete user ${names[0]}` : `Delete ${names.length} users`,
        message:
          (names.length === 1
            ? `${names[0]} and its permissions are removed; its connections are closed.`
            : `${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""} and their permissions are removed; their connections are closed.`) +
          (mine ? " This connection logs in as one of them, so it will stop working." : ""),
        confirmLabel: names.length === 1 ? "Delete user" : `Delete ${names.length} users`,
      });
      if (!ok) return;
      const done = await mutate(
        cid,
        () => (names.length === 1 ? rabbit(cid).del(paths.user(names[0])) : rabbit(cid).post(paths.usersBulkDelete, { users: names })),
        names.length === 1 ? "User deleted" : `Deleted ${names.length} users`,
        names.length === 1 ? names[0] : undefined,
      );
      if (done) setSelected(new Set());
    },
    [cid, me],
  );

  const menu = useCallback(
    (r: UserRow, sel: Set<string>): MenuEntry[] => {
      const names = sel.size > 1 && sel.has(r.name) ? [...sel] : [r.name];
      return [
        { label: names.length > 1 ? `Delete ${names.length} users` : "Delete user", icon: Trash2, danger: true, disabled: readOnly, onSelect: () => void deleteUsers(names) },
      ];
    },
    [readOnly, deleteUsers],
  );

  const current = selected.size === 1 ? (live.data ?? []).find((r) => r.name === [...selected][0]) : undefined;
  const newUser = () => openDialog("create-user", { connectionId: cid });

  return (
    <SectionFrame
      toolbar={
        <ViewToolbar>
          <ViewTitle icon={Users} name="Users" kind={`${int(live.data?.length ?? 0)} in total`} />
          <FilterField value={filter} onChange={setFilter} placeholder="Filter by name or tag" className="ml-2" />
          <Spacer />
          {selected.size > 1 && (
            <Button variant="destructive" disabled={readOnly} title={readOnly ? READ_ONLY_REASON : undefined} onClick={() => void deleteUsers([...selected])}>
              <Trash2 />
              Delete {selected.size} users
            </Button>
          )}
          <Button variant="primary" onClick={newUser} {...mutating(cid)}>
            <Plus />
            New user
          </Button>
        </ViewToolbar>
      }
      inspector={
        selected.size > 1 ? (
          <Inspector title={`${selected.size} users selected`} label="Selection">
            <EmptyState title="Several selected">Delete them together from the toolbar or the right-click menu.</EmptyState>
          </Inspector>
        ) : current ? (
          <UserInspector key={current.name} cid={cid} row={current} vhosts={vhosts} readOnly={readOnly} isMe={current.name === me} onDelete={(n) => void deleteUsers([n])} />
        ) : null
      }
    >
      {live.error && !live.data ? (
        <ErrorState error={live.error} onRetry={() => void live.refresh()} />
      ) : !live.data ? (
        <Loading />
      ) : (
        <DataTable
          aria-label="Users"
          rows={rows}
          columns={columns}
          rowKey={keyOf}
          multi
          selected={selected}
          onSelectionChange={(keys) => setSelected(keys)}
          menu={menu}
          reveal={tab.focus}
          defaultSort={{ column: "name", desc: false }}
          empty={filter ? "No users match." : "No users."}
        />
      )}
    </SectionFrame>
  );
}

const UserInspector = memo(function UserInspector({
  cid,
  row,
  vhosts,
  readOnly,
  isMe,
  onDelete,
}: {
  cid: string;
  row: UserRow;
  vhosts: string[];
  readOnly: boolean;
  isMe: boolean;
  onDelete: (name: string) => void;
}) {
  const [tags, setTags] = useState(row.tags);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const tagsDirty = tags.join(",") !== row.tags.join(",");
  const passwordOk = password.length > 0 && password === confirm;

  return (
    <Inspector
      label="User"
      title={row.name}
      subtitle={isMe ? "You are logged in as this user" : "User"}
      actions={
        <Button size="sm" variant="ghost" disabled={readOnly} title={readOnly ? READ_ONLY_REASON : "Delete user"} onClick={() => onDelete(row.name)}>
          <Trash2 />
          Delete
        </Button>
      }
    >
      <SectionHeader
        actions={
          tagsDirty && (
            <Button
              size="sm"
              variant="primary"
              disabled={readOnly}
              title={readOnly ? READ_ONLY_REASON : undefined}
              onClick={() => void mutate(cid, () => putUser(cid, row, { tags }), "Tags saved", row.name)}
            >
              Save tags
            </Button>
          )
        }
      >
        Tags
      </SectionHeader>
      <div className="px-3 pb-2">
        <TagChips value={tags} onChange={setTags} disabled={readOnly} />
      </div>

      <SectionHeader>Password</SectionHeader>
      <div className="flex flex-col gap-1.5 px-3 pb-2">
        <div className="text-sm text-fg-3">
          {row.hasPassword ? `Set (${row.algorithm.replace("rabbit_password_hashing_", "") || "hashed"}).` : "None: it can only log in through another mechanism."}
        </div>
        <Input type="password" autoComplete="new-password" placeholder="New password" aria-label="New password" value={password} disabled={readOnly} onChange={(e) => setPassword(e.target.value)} />
        <Input
          type="password"
          autoComplete="new-password"
          placeholder="Confirm password"
          aria-label="Confirm password"
          value={confirm}
          disabled={readOnly}
          aria-invalid={confirm.length > 0 && !passwordOk ? true : undefined}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={readOnly || !passwordOk}
            title={readOnly ? READ_ONLY_REASON : undefined}
            onClick={async () => {
              if (await mutate(cid, () => putUser(cid, row, { password }), "Password changed", row.name)) {
                setPassword("");
                setConfirm("");
              }
            }}
          >
            {row.hasPassword ? "Change password" : "Set password"}
          </Button>
          {row.hasPassword && (
            <Button
              size="sm"
              disabled={readOnly}
              title={readOnly ? READ_ONLY_REASON : undefined}
              onClick={async () => {
                const ok = await confirmDestructive(cid, {
                  title: "Remove password",
                  message: `${row.name} will no longer be able to log in with a password.`,
                  confirmLabel: "Remove password",
                });
                if (ok) await mutate(cid, () => putUser(cid, row, { removePassword: true }), "Password removed", row.name);
              }}
            >
              Remove password
            </Button>
          )}
        </div>
      </div>

      <PermissionsEditor cid={cid} perms={row.perms} fixed={{ user: row.name }} options={vhosts} readOnly={readOnly} />
      <TopicPermissionsEditor cid={cid} user={row.name} perms={row.tperms} vhosts={row.perms.map((p) => p.vhost)} readOnly={readOnly} />

      <SectionHeader>Limits</SectionHeader>
      <div className="pb-2">
        {(["max-connections", "max-channels"] as const).map((k) => (
          <LimitEditor
            key={k}
            label={k}
            value={row.limits[k]}
            readOnly={readOnly}
            onSet={(value) => void mutate(cid, () => rabbit(cid).put(paths.userLimit(row.name, k), { value }), "Limit set", `${row.name} ${k} = ${value}`)}
            onClear={() => void mutate(cid, () => rabbit(cid).del(paths.userLimit(row.name, k)), "Limit cleared", `${row.name} ${k}`)}
          />
        ))}
      </div>
    </Inspector>
  );
});
