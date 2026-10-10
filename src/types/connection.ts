/** Where the management API is: its URL, or host and port. */
export type ConnectionSource =
  | { kind: "uri"; uri: string }
  | { kind: "manual"; host: string; port: number };

export interface TlsOptions {
  /** https, for a manual source (a URL says it itself). */
  enabled: boolean;
  caFile: string | null;
  certFile: string | null;
  keyFile: string | null;
  allowInvalidCertificates: boolean;
}

/** AMQP 0-9-1 access, for moving/replaying chosen messages and streams. */
export interface AmqpOptions {
  enabled: boolean;
  /** The management host when null. */
  host: string | null;
  port: number;
  tls: boolean;
}

export type SshAuthMethod = "password" | "private_key" | "agent";

export interface SshTunnelOptions {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  authMethod: SshAuthMethod;
  privateKeyPath: string | null;
  privateKeyHasPassphrase: boolean;
}

/** How the app logs in: a user and password, or OAuth 2 client credentials. */
export type AuthMethod = "password" | "oauth2";

export interface OAuth2Options {
  /** The issuer (discovery names its token endpoint), or the token endpoint. */
  issuer: string;
  clientId: string;
  scope: string | null;
  /** A client secret is saved in the keychain. */
  hasSecret: boolean;
}

export function emptyOAuth2Options(): OAuth2Options {
  return { issuer: "", clientId: "", scope: null, hasSecret: false };
}

export type Environment = "production" | "staging" | "development" | "test";

export const ENVIRONMENTS: { id: Environment; label: string }[] = [
  { id: "production", label: "Production" },
  { id: "staging", label: "Staging" },
  { id: "development", label: "Development" },
  { id: "test", label: "Test" },
];

export interface ConnectionAdvancedOptions {
  requestTimeoutMs: number | null;
  /** How often open views refresh; 5 s when null. */
  refreshIntervalMs: number | null;
  /** Nothing that changes the broker. */
  readOnly: boolean;
  /** Destructive actions ask for the connection's name to be typed. */
  typedConfirmation: boolean;
  /** Lists show amq.* and the default exchange. */
  showSystemObjects: boolean;
}

export interface ConnectionProfile {
  id: string;
  name: string;
  color?: string | null;
  environment: Environment;
  source: ConnectionSource;
  auth?: AuthMethod;
  oauth2?: OAuth2Options;
  username: string | null;
  hasPassword: boolean;
  tls: TlsOptions;
  amqp: AmqpOptions;
  sshTunnel: SshTunnelOptions | null;
  advanced: ConnectionAdvancedOptions;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionProfileInput {
  id?: string | null;
  name: string;
  color?: string | null;
  environment: Environment;
  source: ConnectionSource;
  auth: AuthMethod;
  oauth2: OAuth2Options;
  /** Blank keeps the saved one. */
  oauth2ClientSecret: string | null;
  username: string | null;
  password: string | null;
  tls: TlsOptions;
  amqp: AmqpOptions;
  sshTunnel: SshTunnelOptions | null;
  sshPassword: string | null;
  sshKeyPassphrase: string | null;
  advanced: ConnectionAdvancedOptions;
}

export interface ConnectionProfileMeta {
  id: string;
  name: string;
  color?: string | null;
  environment: Environment;
  /** The management URL, credentials masked. */
  summary: string;
  readOnly: boolean;
  /** Destructive actions ask for the name to be typed (always in production). */
  typedConfirmation: boolean;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  serverVersion: string | null;
  clusterName: string | null;
  /** Whether the AMQP port answered; null when AMQP is off. */
  amqpReachable: boolean | null;
}

export interface ConnectionHandle {
  sessionId: string;
  serverVersion: string | null;
  managementVersion: string | null;
  clusterName: string | null;
  erlangVersion: string | null;
  user: string;
  tags: string[];
  readOnly: boolean;
  amqp: boolean;
}

export interface SecretBackendInfo {
  backend: "keyring" | "encrypted_file";
  warning: string | null;
}

export interface ConnectionsExportSummary {
  exported: number;
}

export interface ConnectionImportPreview {
  index: number;
  name: string;
  address: string;
  warning: string | null;
  error: string | null;
  exists: boolean;
}

export interface ConnectionsImportSummary {
  imported: number;
  errors: string[];
  warnings: string[];
}

export function emptyTlsOptions(): TlsOptions {
  return { enabled: false, caFile: null, certFile: null, keyFile: null, allowInvalidCertificates: false };
}

export function emptyAmqpOptions(): AmqpOptions {
  return { enabled: true, host: null, port: 5672, tls: false };
}

export function emptyAdvancedOptions(): ConnectionAdvancedOptions {
  return {
    requestTimeoutMs: null,
    refreshIntervalMs: null,
    readOnly: false,
    typedConfirmation: false,
    showSystemObjects: false,
  };
}

export function emptySshTunnelOptions(): SshTunnelOptions {
  return {
    enabled: false,
    host: "",
    port: 22,
    username: "",
    authMethod: "password",
    privateKeyPath: null,
    privateKeyHasPassphrase: false,
  };
}

export function newProfileInput(): ConnectionProfileInput {
  return {
    id: null,
    name: "",
    color: null,
    environment: "development",
    source: { kind: "manual", host: "localhost", port: 15672 },
    auth: "password",
    oauth2: emptyOAuth2Options(),
    oauth2ClientSecret: null,
    username: "guest",
    password: null,
    tls: emptyTlsOptions(),
    amqp: emptyAmqpOptions(),
    sshTunnel: null,
    sshPassword: null,
    sshKeyPassphrase: null,
    advanced: emptyAdvancedOptions(),
  };
}

/**
 * Form input for editing a saved profile. Secrets never leave the backend,
 * so they come back blank - and saving a blank one keeps what's stored.
 */
export function profileToInput(profile: ConnectionProfile): ConnectionProfileInput {
  return {
    id: profile.id,
    name: profile.name,
    color: profile.color ?? null,
    environment: profile.environment ?? "development",
    source: profile.source,
    auth: profile.auth ?? "password",
    oauth2: { ...emptyOAuth2Options(), ...profile.oauth2 },
    oauth2ClientSecret: null,
    username: profile.username,
    password: null,
    tls: { ...emptyTlsOptions(), ...profile.tls },
    amqp: { ...emptyAmqpOptions(), ...profile.amqp },
    sshTunnel: profile.sshTunnel,
    sshPassword: null,
    sshKeyPassphrase: null,
    advanced: { ...emptyAdvancedOptions(), ...profile.advanced },
  };
}
