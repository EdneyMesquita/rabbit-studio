use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

pub type ConnectionId = String;
pub type SessionId = String;

/// The management plugin's port, and AMQP's.
pub const DEFAULT_MGMT_PORT: u16 = 15672;
pub const DEFAULT_AMQP_PORT: u16 = 5672;

/// Where the management API is.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ConnectionSource {
    /// The management URL, `http(s)://host:port[/prefix]`. Any user info
    /// in it moves to the profile (and the password to the secret store)
    /// before it is persisted.
    Uri { uri: String },
    /// A host/port form; `tls.enabled` picks https.
    Manual { host: String, port: u16 },
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TlsOptions {
    /// https for the management API (a manual source only: a URI says).
    #[serde(default)]
    pub enabled: bool,
    /// PEM file with the CA certificates to trust; the system's when absent.
    pub ca_file: Option<String>,
    /// PEM client certificate and its (unencrypted) private key.
    pub cert_file: Option<String>,
    pub key_file: Option<String>,
    /// Accepts any certificate: self-signed lab servers only.
    #[serde(default)]
    pub allow_invalid_certificates: bool,
}

/// AMQP 0-9-1 access, for what the management API can't do: moving,
/// replaying or deleting chosen messages, and reading streams.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AmqpOptions {
    pub enabled: bool,
    /// The management host when absent.
    pub host: Option<String>,
    pub port: u16,
    /// amqps.
    #[serde(default)]
    pub tls: bool,
}

impl Default for AmqpOptions {
    fn default() -> Self {
        Self {
            enabled: true,
            host: None,
            port: DEFAULT_AMQP_PORT,
            tls: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SshAuthMethod {
    Password,
    PrivateKey,
    Agent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshTunnelOptions {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: SshAuthMethod,
    pub private_key_path: Option<String>,
    /// Whether a passphrase for `private_key_path` is held in the secret store.
    pub private_key_has_passphrase: bool,
}

/// How the app logs in to the management API (and AMQP).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethod {
    /// A user and password (basic auth; AMQP PLAIN).
    #[default]
    Password,
    /// OAuth 2 client credentials: the app gets a token from the issuer and
    /// sends it as a bearer token (and as the AMQP password).
    Oauth2,
}

/// The OAuth 2 client the app logs in as. The secret is in the secret store.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuth2Options {
    /// The issuer (its `/.well-known/openid-configuration` names the token
    /// endpoint), or the token endpoint itself.
    pub issuer: String,
    pub client_id: String,
    /// Scopes to ask for; the issuer's defaults when absent.
    #[serde(default)]
    pub scope: Option<String>,
    /// Whether a client secret is held in the secret store.
    #[serde(default)]
    pub has_secret: bool,
}

/// The environment a connection belongs to: groups the explorer and sets
/// how careful the app is with it.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Environment {
    Production,
    Staging,
    #[default]
    Development,
    Test,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionAdvancedOptions {
    pub request_timeout_ms: Option<u64>,
    /// How often open views refresh; 5 s when absent.
    pub refresh_interval_ms: Option<u64>,
    /// Nothing that changes the broker: no publish, purge, delete, move or
    /// definition import (production safety).
    #[serde(default)]
    pub read_only: bool,
    /// Destructive actions ask for the connection's name to be typed.
    #[serde(default)]
    pub typed_confirmation: bool,
    /// Whether lists show the `amq.*` exchanges and the default exchange.
    #[serde(default)]
    pub show_system_objects: bool,
}

/// Persisted, non-secret connection metadata. Lives in `connections.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfile {
    pub id: ConnectionId,
    pub name: String,
    /// Identity color as `#RRGGBB`; `None` lets the UI pick one from the id.
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub environment: Environment,
    pub source: ConnectionSource,
    #[serde(default)]
    pub auth: AuthMethod,
    #[serde(default)]
    pub oauth2: OAuth2Options,
    pub username: Option<String>,
    /// Whether a password for `username` is held in the secret store.
    pub has_password: bool,
    #[serde(default)]
    pub tls: TlsOptions,
    #[serde(default)]
    pub amqp: AmqpOptions,
    pub ssh_tunnel: Option<SshTunnelOptions>,
    #[serde(default)]
    pub advanced: ConnectionAdvancedOptions,
    pub created_at: String,
    pub updated_at: String,
}

/// What the frontend submits when creating/editing a profile. Secret fields
/// here are written to the secret store and never appear in `ConnectionProfile`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfileInput {
    pub id: Option<ConnectionId>,
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub environment: Environment,
    pub source: ConnectionSource,
    #[serde(default)]
    pub auth: AuthMethod,
    #[serde(default)]
    pub oauth2: OAuth2Options,
    #[serde(default)]
    pub oauth2_client_secret: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    #[serde(default)]
    pub tls: TlsOptions,
    #[serde(default)]
    pub amqp: AmqpOptions,
    pub ssh_tunnel: Option<SshTunnelOptions>,
    pub ssh_password: Option<String>,
    pub ssh_key_passphrase: Option<String>,
    #[serde(default)]
    pub advanced: ConnectionAdvancedOptions,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfileMeta {
    pub id: ConnectionId,
    pub name: String,
    pub color: Option<String>,
    pub environment: Environment,
    pub summary: String,
    pub read_only: bool,
    /// Destructive actions ask for the name to be typed (always in production).
    pub typed_confirmation: bool,
}

impl ConnectionProfile {
    /// The management API's base URL, `scheme://host:port[/prefix]`, without
    /// user info or a trailing slash.
    pub fn management_url(&self) -> String {
        match &self.source {
            ConnectionSource::Uri { uri } => uri.trim_end_matches('/').to_string(),
            ConnectionSource::Manual { host, port } => {
                let scheme = if self.tls.enabled { "https" } else { "http" };
                format!("{scheme}://{host}:{port}")
            }
        }
    }
}

impl From<&ConnectionProfile> for ConnectionProfileMeta {
    fn from(profile: &ConnectionProfile) -> Self {
        Self {
            id: profile.id.clone(),
            name: profile.name.clone(),
            color: profile.color.clone(),
            environment: profile.environment,
            summary: redact_uri_summary(&profile.management_url()),
            read_only: profile.advanced.read_only,
            typed_confirmation: profile.advanced.typed_confirmation
                || profile.environment == Environment::Production,
        }
    }
}

/// A connection color is either absent or a `#RRGGBB` hex string.
pub(crate) fn validate_color(color: Option<&str>) -> AppResult<()> {
    match color {
        None => Ok(()),
        Some(c)
            if c.len() == 7
                && c.starts_with('#')
                && c[1..].chars().all(|ch| ch.is_ascii_hexdigit()) =>
        {
            Ok(())
        }
        Some(c) => Err(AppError::InvalidInput(format!(
            "connection color must be a #RRGGBB hex value, got \"{c}\""
        ))),
    }
}

/// The URL with any `user:password@` masked and the query string dropped.
pub(crate) fn redact_uri_summary(uri: &str) -> String {
    let uri = uri.split('?').next().unwrap_or(uri);
    match (uri.find("://"), uri.find('@')) {
        (Some(scheme_idx), Some(at_idx)) if scheme_idx < at_idx => {
            format!("{}://***@{}", &uri[..scheme_idx], &uri[at_idx + 1..])
        }
        _ => uri.to_string(),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub success: bool,
    pub message: String,
    pub server_version: Option<String>,
    pub cluster_name: Option<String>,
    /// Whether the AMQP port answered; None when AMQP is off.
    pub amqp_reachable: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionHandle {
    pub session_id: SessionId,
    pub server_version: Option<String>,
    pub management_version: Option<String>,
    pub cluster_name: Option<String>,
    pub erlang_version: Option<String>,
    /// The user the app is logged in as, and its tags.
    pub user: String,
    pub tags: Vec<String>,
    pub read_only: bool,
    pub amqp: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SecretBackendKind {
    Keyring,
    EncryptedFile,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretBackendInfo {
    pub backend: SecretBackendKind,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionsExportSummary {
    pub exported: usize,
}

/// One connection found in an import file, shown for picking before
/// anything is saved.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionImportPreview {
    /// Position in the file; what `import_connections` takes to select it.
    pub index: usize,
    pub name: String,
    /// Where it connects, credentials masked.
    pub address: String,
    /// Imports, but needs attention afterwards.
    pub warning: Option<String>,
    /// Can't be imported; the reason why.
    pub error: Option<String>,
    /// A saved connection already has this name.
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionsImportSummary {
    pub imported: usize,
    /// Why individual connections in the file were skipped; the rest of the
    /// file still imports.
    pub errors: Vec<String>,
    /// Notes about connections that were imported but need attention.
    pub warnings: Vec<String>,
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summaries_never_show_credentials() {
        assert_eq!(
            redact_uri_summary("https://alice:s3cret@mq.example.com:15671/rabbit?x=1"),
            "https://***@mq.example.com:15671/rabbit"
        );
        assert_eq!(redact_uri_summary("http://mq:15672"), "http://mq:15672");
    }
}
