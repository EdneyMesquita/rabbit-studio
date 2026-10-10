import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useLive } from "@/hooks/useLive";
import { rabbit } from "@/lib/rabbit/client";
import { paths } from "@/lib/rabbit/paths";
import type { MessageProperties, VHost } from "@/types/rabbit";
import type { DialogProps } from "../types";
import PublishForm from "./PublishForm";

/** The publish form as a task dialog, opened from the palette or a menu. */
export default function PublishDialog({ context, onClose }: DialogProps) {
  const { connectionId } = context;
  const data = context.data ?? {};
  const [vhost, setVhost] = useState(context.vhost ?? "");

  // Only asked when the dialog was opened without a vhost.
  const vhosts = useLive<Pick<VHost, "name">[]>(
    context.vhost == null ? `${connectionId}:publish-vhosts` : null,
    () => rabbit(connectionId).get(`${paths.vhosts}?columns=name`),
    { interval: 0 },
  );

  const picker = context.vhost == null && (
    <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm text-fg-2">
      Virtual host
      <select
        value={vhost}
        onChange={(e) => setVhost(e.target.value)}
        aria-label="Virtual host"
        className="h-7 rounded-sm border border-field-line bg-field px-1.5 font-mono text-[12.5px] text-fg outline-none focus:border-accent"
      >
        <option value="" disabled>
          Choose a vhost
        </option>
        {(vhosts.data ?? []).map((v) => (
          <option key={v.name} value={v.name}>
            {v.name}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <Modal title="Publish message" onClose={onClose} width="max-w-5xl" bodyClassName="p-0">
      {picker}
      <div className="flex h-[min(620px,72vh)] flex-col">
        {vhost !== "" || context.vhost != null ? (
          <PublishForm
            key={vhost}
            connectionId={connectionId}
            vhost={vhost}
            exchange={(data.exchange as string | undefined)}
            routingKey={data.routingKey as string | undefined}
            payload={data.payload as string | undefined}
            properties={data.properties as MessageProperties | undefined}
          />
        ) : (
          <div className="p-6 text-sm text-fg-3">Choose a virtual host to publish into.</div>
        )}
      </div>
    </Modal>
  );
}
