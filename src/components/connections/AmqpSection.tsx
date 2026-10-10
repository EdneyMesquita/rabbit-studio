import { Input } from "@/components/ui/input";
import { DATA_FIELD, managementHost, type ConnectionSectionProps } from "./connectionFormTypes";
import { Field } from "./Field";
import { FieldRow } from "./FieldRow";
import { SwitchField } from "./SwitchField";

export function AmqpSection({ input, update }: ConnectionSectionProps) {
  const amqp = input.amqp;
  const off = !amqp.enabled;
  const set = (patch: Partial<typeof amqp>) => update("amqp", { ...amqp, ...patch });
  return (
    <>
      <SwitchField
        label="Use AMQP"
        description="Moving or replaying chosen messages and reading streams go over AMQP 0-9-1, with the same user. Everything else uses the management API."
        checked={amqp.enabled}
        onCheckedChange={(enabled) => set({ enabled })}
      />
      <FieldRow>
        <Field label="Host" htmlFor="amqp-host" help="The management host when empty.">
          <Input
            id="amqp-host"
            className={DATA_FIELD}
            spellCheck={false}
            value={amqp.host ?? ""}
            onChange={(e) => set({ host: e.target.value || null })}
            placeholder={managementHost(input) || "Same as the management API"}
            disabled={off}
          />
        </Field>
        <Field label="Port" htmlFor="amqp-port">
          <Input
            id="amqp-port"
            className={DATA_FIELD}
            type="number"
            value={amqp.port}
            onChange={(e) => set({ port: Number(e.target.value) })}
            disabled={off}
          />
        </Field>
      </FieldRow>
      <SwitchField
        label="amqps (TLS)"
        description="Usually port 5671. Uses the certificates of the TLS section."
        checked={amqp.tls}
        onCheckedChange={(tls) => set({ tls, port: tls && amqp.port === 5672 ? 5671 : !tls && amqp.port === 5671 ? 5672 : amqp.port })}
        disabled={off}
      />
    </>
  );
}
