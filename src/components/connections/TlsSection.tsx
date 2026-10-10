import { Info } from "lucide-react";
import { type ConnectionSectionProps, managementTls } from "./connectionFormTypes";
import { Field } from "./Field";
import { FilePicker } from "./FilePicker";
import { SwitchField } from "./SwitchField";

export function TlsSection({ input, update }: ConnectionSectionProps) {
  const tls = input.tls;
  const on = managementTls(input);
  return (
    <>
      {!on && (
        <p className="flex items-start gap-2 rounded-md bg-fg/6 px-3 py-2 text-sm text-fg-2">
          <Info className="mt-px size-3.5 shrink-0" />
          {input.source.kind === "uri"
            ? "The URL is http://, so the management API is reached without TLS. These apply to an https:// URL and to amqps."
            : "https is off in General. These apply once it's on, and to amqps."}
        </p>
      )}
      <Field label="Certificate authority" htmlFor="tls-ca" help="PEM file with the CA certificates to trust; the system's when empty.">
        <FilePicker id="tls-ca" value={tls.caFile} onChange={(caFile) => update("tls", { ...tls, caFile })} placeholder="System trust store" />
      </Field>
      <Field label="Client certificate" htmlFor="tls-cert" help="PEM certificate, for brokers that ask for one (mutual TLS).">
        <FilePicker id="tls-cert" value={tls.certFile} onChange={(certFile) => update("tls", { ...tls, certFile })} placeholder="None" />
      </Field>
      <Field label="Client key" htmlFor="tls-key" help="Its PEM private key, unencrypted.">
        <FilePicker id="tls-key" value={tls.keyFile} onChange={(keyFile) => update("tls", { ...tls, keyFile })} placeholder="None" />
      </Field>
      <SwitchField
        label="Allow invalid certificates"
        description="Skips checking the broker's certificate and host name. Only for self-signed brokers on a private network: it leaves the connection open to impersonation."
        checked={tls.allowInvalidCertificates}
        onCheckedChange={(allowInvalidCertificates) => update("tls", { ...tls, allowInvalidCertificates })}
      />
    </>
  );
}
