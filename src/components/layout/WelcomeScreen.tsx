import { LayoutGrid, Loader2, Lock, Network, Plus, Search, ShieldAlert, Upload } from "lucide-react";
import { ConnectionChip } from "@/components/ui/ConnectionChip";
import { Kbd } from "@/components/ui/kbd";
import { version } from "../../../package.json";
import { connectionColor } from "../../lib/connectionColor";
import { openOn } from "../../lib/rabbit/nav";
import { useConnectionsStore } from "../../store/connectionsStore";
import { useUiStore } from "../../store/uiStore";
import { ENVIRONMENTS } from "../../types/connection";
import { AppLogo } from "./AppLogo";
import { WelcomeAction } from "./WelcomeAction";

/** Nothing connected and nothing open: how to start, and every saved cluster. */
export function WelcomeScreen() {
  const profiles = useConnectionsStore((s) => s.profiles);
  const profilesLoaded = useConnectionsStore((s) => s.profilesLoaded);
  const connecting = useConnectionsStore((s) => s.connecting);
  const connectErrors = useConnectionsStore((s) => s.connectErrors);
  const setConnectionDialog = useUiStore((s) => s.setConnectionDialog);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const setImportExportOpen = useUiStore((s) => s.setImportExportOpen);
  const empty = profilesLoaded && profiles.length === 0;

  async function connect(id: string) {
    await useConnectionsStore.getState().connect(id);
    // Straight to where its health is.
    if (useConnectionsStore.getState().sessions[id]) openOn(id, { kind: "overview" });
  }

  return (
    <div className="grid flex-1 place-items-center overflow-auto px-6 py-10">
      <div className="grid w-[min(760px,100%)] grid-cols-2 gap-12 max-[960px]:grid-cols-1 max-[960px]:gap-7">
        <h1 className="col-span-full m-0 flex items-center gap-3.5 text-xl font-semibold tracking-[-0.01em]">
          <AppLogo className="size-10" />
          <span>
            Rabbit Studio
            <small className="mt-0.5 block text-base font-normal tracking-normal text-fg-2">
              Version {version} · one console for every RabbitMQ cluster
            </small>
          </span>
        </h1>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-fg-2">Start</h2>
          <div className="flex flex-col">
            <WelcomeAction icon={<Plus />} trailing={<Kbd>Ctrl N</Kbd>} onClick={() => setConnectionDialog({ mode: "new" })}>
              {empty ? "Add your first connection" : "New connection"}
            </WelcomeAction>
            <WelcomeAction icon={<Upload />} onClick={() => setImportExportOpen(true)}>
              Import connections…
            </WelcomeAction>
            {!empty && (
              <>
                <WelcomeAction icon={<LayoutGrid />} onClick={() => openOn(null, { kind: "global" })}>
                  All clusters
                </WelcomeAction>
                <WelcomeAction icon={<Search />} trailing={<Kbd>Ctrl K</Kbd>} onClick={() => setPaletteOpen(true)}>
                  Search everything
                </WelcomeAction>
              </>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-fg-2">Connect</h2>
          <div className="flex flex-col">
            {empty && (
              <p className="py-2 text-sm text-fg-3">
                No saved connections yet. Add one with its management API URL (port 15672, or 15671 over TLS).
              </p>
            )}
            {profiles.map((p) => (
              <WelcomeAction
                key={p.id}
                icon={<ConnectionChip name={p.name} color={connectionColor(p.id, p.color)} />}
                disabled={!!connecting[p.id]}
                onClick={() => connect(p.id)}
                trailing={
                  connecting[p.id] ? (
                    <Loader2 className="size-3.5 animate-spin text-fg-3" />
                  ) : connectErrors[p.id] ? (
                    <span className="truncate text-xs text-danger" title={connectErrors[p.id]}>
                      {connectErrors[p.id]}
                    </span>
                  ) : (
                    <span className="truncate text-xs text-fg-3">
                      {ENVIRONMENTS.find((e) => e.id === p.environment)?.label} ·{" "}
                      <span className="font-data">{p.summary}</span>
                    </span>
                  )
                }
              >
                {p.name}
              </WelcomeAction>
            ))}
          </div>
        </section>

        <div className="col-span-full grid grid-cols-[repeat(3,auto)] justify-between gap-x-4.5 gap-y-3 border-t border-line-soft pt-4 text-sm text-fg-2 max-[960px]:grid-cols-1 [&_svg]:size-3 [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1.5">
          <span>
            <Lock />
            Passwords live in the system keychain
          </span>
          <span>
            <Network />
            Many clusters side by side
          </span>
          <span>
            <ShieldAlert />
            Production asks before anything destructive
          </span>
        </div>
      </div>
    </div>
  );
}
