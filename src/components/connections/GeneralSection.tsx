import { Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useConnectionsStore } from "@/store/connectionsStore";
import { looksLikeUrl, urlUser } from "@/lib/connectionUri";
import { ENVIRONMENTS, type AuthMethod, type ConnectionSource, type Environment } from "@/types/connection";
import { ColorSwatches } from "./ColorSwatches";
import { DATA_FIELD, KEEP_SAVED, type ConnectionSectionProps } from "./connectionFormTypes";
import { Field } from "./Field";
import { FieldRow } from "./FieldRow";
import { ParsedUriChips } from "./ParsedUriChips";
import { SectionTitle } from "./SectionTitle";
import { SwitchField } from "./SwitchField";

interface GeneralSectionProps extends ConnectionSectionProps {
  /** The color automatic resolves to for this connection. */
  autoColor: string;
}

export function GeneralSection({ input, update, editing, autoColor }: GeneralSectionProps) {
  const keychain = useConnectionsStore((s) => s.secretBackend?.backend !== "encrypted_file");
  const source = input.source;

  // The backend prefers the Username field over a user in the URL, so a
  // URL with one fills the field in: what's shown is what's saved.
  function setUri(uri: string) {
    update("source", { kind: "uri", uri });
    const user = urlUser(uri);
    if (user) update("username", user);
  }

  return (
    <>
      <Field label="Name" htmlFor="conn-name">
        <Input id="conn-name" value={input.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Production EU" />
      </Field>

      <Field
        label="Environment"
        help={
          input.environment === "production"
            ? "Production: destructive actions always ask for the connection's name to be typed."
            : "Groups the connection in the Explorer."
        }
      >
        <SegmentedControl<Environment>
          aria-label="Environment"
          value={input.environment}
          onChange={(environment) => update("environment", environment)}
          options={ENVIRONMENTS.map((e) => ({ value: e.id, label: e.label }))}
        />
      </Field>

      <Field label="Color" help="Tints the toolbar, the tab underline and the status bar, so production never looks like local.">
        <ColorSwatches value={input.color ?? null} onChange={(color) => update("color", color)} autoColor={autoColor} />
      </Field>

      <SectionTitle>Management API</SectionTitle>
      <Field label="Connect with">
        <SegmentedControl<ConnectionSource["kind"]>
          aria-label="Connect with"
          value={source.kind}
          onChange={(kind) =>
            update("source", kind === "uri" ? { kind: "uri", uri: "" } : { kind: "manual", host: "localhost", port: 15672 })
          }
          options={[
            { value: "uri", label: "URL" },
            { value: "manual", label: "Host and port" },
          ]}
        />
      </Field>

      {source.kind === "uri" ? (
        <Field label="Management API URL" htmlFor="conn-uri">
          <Input
            id="conn-uri"
            className={DATA_FIELD}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={source.uri}
            onChange={(e) => setUri(e.target.value)}
            placeholder="https://rabbit.example.internal:15671"
          />
          <ParsedUriChips uri={source.uri} />
        </Field>
      ) : (
        <>
          <FieldRow>
            <Field label="Host" htmlFor="conn-host">
              <Input
                id="conn-host"
                className={DATA_FIELD}
                spellCheck={false}
                value={source.host}
                onChange={(e) => {
                  const value = e.target.value;
                  // A whole URL pasted here belongs in the URL field.
                  if (looksLikeUrl(value)) setUri(value.trim());
                  else update("source", { ...source, host: value });
                }}
                placeholder="localhost"
              />
            </Field>
            <Field label="Port" htmlFor="conn-port">
              <Input
                id="conn-port"
                className={DATA_FIELD}
                type="number"
                value={source.port}
                onChange={(e) => update("source", { ...source, port: Number(e.target.value) })}
              />
            </Field>
          </FieldRow>
          <SwitchField
            label="https"
            description="The management plugin listens with TLS (usually port 15671). Certificates are in the TLS section."
            checked={input.tls.enabled}
            onCheckedChange={(enabled) => update("tls", { ...input.tls, enabled })}
          />
        </>
      )}

      <Field
        label="Authentication"
        help={
          input.auth === "oauth2"
            ? "The app gets a token from the issuer with these client credentials and renews it before it expires; RabbitMQ needs its OAuth 2 plugin."
            : "Client certificates go in TLS: the management API itself logs in with a password or an OAuth 2 token, not a certificate."
        }
      >
        <SegmentedControl<AuthMethod>
          aria-label="Authentication"
          value={input.auth}
          onChange={(auth) => update("auth", auth)}
          options={[
            { value: "password", label: "Password" },
            { value: "oauth2", label: "OAuth 2" },
          ]}
        />
      </Field>

      {input.auth === "oauth2" ? (
        <>
          <Field label="Issuer" htmlFor="conn-issuer">
            <Input
              id="conn-issuer"
              className={DATA_FIELD}
              autoComplete="off"
              spellCheck={false}
              value={input.oauth2.issuer}
              onChange={(e) => update("oauth2", { ...input.oauth2, issuer: e.target.value })}
              placeholder="https://keycloak.internal/realms/ops"
            />
          </Field>
          <FieldRow>
            <Field label="Client ID" htmlFor="conn-client-id">
              <Input
                id="conn-client-id"
                className={DATA_FIELD}
                autoComplete="off"
                spellCheck={false}
                value={input.oauth2.clientId}
                onChange={(e) => update("oauth2", { ...input.oauth2, clientId: e.target.value })}
                placeholder="rabbit-studio"
              />
            </Field>
            <Field
              label="Client secret"
              htmlFor="conn-client-secret"
          help={
            <>
              <Lock />
              {keychain ? "Saved in the system keychain, never in the connection file" : "Saved encrypted, never in the connection file"}
            </>
          }
            >
              <Input
                id="conn-client-secret"
                type="password"
                autoComplete="new-password"
                value={input.oauth2ClientSecret ?? ""}
                onChange={(e) => update("oauth2ClientSecret", e.target.value || null)}
                placeholder={editing?.oauth2?.hasSecret ? KEEP_SAVED : ""}
              />
            </Field>
          </FieldRow>
          <Field label="Scope" htmlFor="conn-scope" help="Optional: the issuer's defaults when blank.">
            <Input
              id="conn-scope"
              className={DATA_FIELD}
              autoComplete="off"
              spellCheck={false}
              value={input.oauth2.scope ?? ""}
              onChange={(e) => update("oauth2", { ...input.oauth2, scope: e.target.value || null })}
              placeholder="rabbitmq.tag:administrator"
            />
          </Field>
        </>
      ) : (
      <FieldRow>
          <Field label="Username" htmlFor="conn-user">
            <Input
              id="conn-user"
              className={DATA_FIELD}
              autoComplete="off"
              spellCheck={false}
              value={input.username ?? ""}
              onChange={(e) => update("username", e.target.value || null)}
              placeholder={source.kind === "uri" ? "From the URL, else guest" : "guest"}
            />
          </Field>
          <Field
            label="Password"
            htmlFor="conn-password"
            help={
              <>
                <Lock />
                {keychain ? "Saved in the system keychain, never in the connection file" : "Saved encrypted, never in the connection file"}
              </>
            }
          >
            <Input
              id="conn-password"
              type="password"
              autoComplete="new-password"
              value={input.password ?? ""}
              onChange={(e) => update("password", e.target.value || null)}
              placeholder={editing?.hasPassword ? KEEP_SAVED : source.kind === "uri" ? "From the URL" : "Optional"}
            />
          </Field>
        </FieldRow>
      )}
    </>
  );
}
