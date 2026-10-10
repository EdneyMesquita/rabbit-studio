//! Import/export of connection profiles.
//!
//! Export writes the app's own JSON (`{"type": "Rabbit Studio
//! Connections", "version": 1, "connections": [...]}`), which keeps every
//! option of a profile. Import reads that back.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::models::{
    AmqpOptions, AuthMethod, ConnectionAdvancedOptions, ConnectionProfile, ConnectionProfileInput,
    ConnectionSource, Environment, OAuth2Options, SshTunnelOptions, TlsOptions,
};
use crate::secrets::{SecretKind, SecretStore};

const FILE_TYPE: &str = "Rabbit Studio Connections";
const FILE_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileEntry {
    name: String,
    #[serde(default)]
    color: Option<String>,
    #[serde(default)]
    environment: Environment,
    source: ConnectionSource,
    #[serde(default)]
    auth: AuthMethod,
    #[serde(default)]
    oauth2: OAuth2Options,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    oauth2_client_secret: Option<String>,
    #[serde(default)]
    username: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    password: Option<String>,
    #[serde(default)]
    tls: TlsOptions,
    #[serde(default)]
    amqp: AmqpOptions,
    #[serde(default)]
    ssh_tunnel: Option<SshTunnelOptions>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    ssh_password: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    ssh_key_passphrase: Option<String>,
    #[serde(default)]
    advanced: ConnectionAdvancedOptions,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExportFile {
    #[serde(rename = "type")]
    file_type: String,
    version: u32,
    connections: Vec<serde_json::Value>,
}

/// Writes `profiles` to `dest_path`. With `include_secrets`, passwords and
/// passphrases are read from the secret store and written in plain text:
/// only the file gets them, never the frontend, and the UI says so.
pub fn export_connections(
    profiles: &[ConnectionProfile],
    include_secrets: bool,
    secrets: &dyn SecretStore,
    dest_path: &Path,
) -> AppResult<usize> {
    let secret = |id: &str, kind: SecretKind| -> AppResult<Option<String>> {
        if include_secrets {
            secrets.get(id, kind).map_err(AppError::Secret)
        } else {
            Ok(None)
        }
    };
    let mut connections = Vec::with_capacity(profiles.len());
    for p in profiles {
        let entry = FileEntry {
            name: p.name.clone(),
            color: p.color.clone(),
            environment: p.environment,
            source: p.source.clone(),
            auth: p.auth,
            oauth2: OAuth2Options {
                has_secret: false,
                ..p.oauth2.clone()
            },
            oauth2_client_secret: if p.oauth2.has_secret {
                secret(&p.id, SecretKind::OAuth2ClientSecret)?
            } else {
                None
            },
            username: p.username.clone(),
            password: if p.has_password {
                secret(&p.id, SecretKind::Password)?
            } else {
                None
            },
            tls: p.tls.clone(),
            amqp: p.amqp.clone(),
            ssh_tunnel: p.ssh_tunnel.clone(),
            ssh_password: secret(&p.id, SecretKind::SshPassword)?,
            ssh_key_passphrase: secret(&p.id, SecretKind::SshKeyPassphrase)?,
            advanced: p.advanced.clone(),
        };
        connections
            .push(serde_json::to_value(entry).map_err(|e| AppError::InvalidInput(e.to_string()))?);
    }
    let file = ExportFile {
        file_type: FILE_TYPE.to_string(),
        version: FILE_VERSION,
        connections,
    };
    let raw =
        serde_json::to_string_pretty(&file).map_err(|e| AppError::InvalidInput(e.to_string()))?;
    std::fs::write(dest_path, raw)?;
    Ok(profiles.len())
}

/// One connection read from a file, ready for `materialize_profile`.
#[derive(Debug)]
pub struct ParsedImportEntry {
    pub input: ConnectionProfileInput,
    /// Imports, but needs attention afterwards.
    pub warning: Option<String>,
}

impl ParsedImportEntry {
    /// Where it connects, for the preview.
    pub fn address(&self) -> String {
        match &self.input.source {
            ConnectionSource::Uri { uri } => crate::models::redact_uri_summary(uri),
            ConnectionSource::Manual { host, port } => format!("{host}:{port}"),
        }
    }
}

/// One `Ok` per importable connection; one that can't be imported becomes
/// an `Err` saying why, so the rest of the file still imports.
pub fn parse_connections_file(raw: &str) -> AppResult<Vec<Result<ParsedImportEntry, String>>> {
    let value: serde_json::Value = serde_json::from_str(raw)
        .map_err(|e| AppError::InvalidInput(format!("not a recognized connections file: {e}")))?;
    if value.get("type").and_then(|t| t.as_str()) == Some(FILE_TYPE) {
        let file: ExportFile = serde_json::from_value(value).map_err(|e| {
            AppError::InvalidInput(format!("not a recognized connections file: {e}"))
        })?;
        return Ok(file
            .connections
            .into_iter()
            .enumerate()
            .map(|(i, entry)| parse_own(i, entry))
            .collect());
    }
    Err(AppError::InvalidInput(
        "Unrecognized file (expected a Rabbit Studio connections export)".to_string(),
    ))
}

fn parse_own(index: usize, raw: serde_json::Value) -> Result<ParsedImportEntry, String> {
    let name = raw
        .get("name")
        .and_then(|n| n.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| format!("Imported connection {}", index + 1));
    let entry: FileEntry =
        serde_json::from_value(raw).map_err(|e| format!("\"{name}\" can't be read: {e}"))?;
    Ok(ParsedImportEntry {
        input: ConnectionProfileInput {
            id: None,
            name: entry.name,
            color: entry.color,
            environment: entry.environment,
            source: entry.source,
            auth: entry.auth,
            oauth2: entry.oauth2,
            oauth2_client_secret: entry.oauth2_client_secret,
            username: entry.username,
            password: entry.password,
            tls: entry.tls,
            amqp: entry.amqp,
            ssh_tunnel: entry.ssh_tunnel,
            ssh_password: entry.ssh_password,
            ssh_key_passphrase: entry.ssh_key_passphrase,
            advanced: entry.advanced,
        },
        warning: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::secrets::InMemoryStore;

    fn profile(id: &str, name: &str) -> ConnectionProfile {
        ConnectionProfile {
            id: id.to_string(),
            name: name.to_string(),
            color: Some("#4FA25A".to_string()),
            environment: Environment::Production,
            auth: AuthMethod::Password,
            oauth2: OAuth2Options::default(),
            source: ConnectionSource::Manual {
                host: "mq.internal".to_string(),
                port: 15672,
            },
            username: Some("alice".to_string()),
            has_password: true,
            tls: TlsOptions {
                enabled: true,
                ..Default::default()
            },
            amqp: AmqpOptions::default(),
            ssh_tunnel: None,
            advanced: ConnectionAdvancedOptions {
                read_only: true,
                ..Default::default()
            },
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn exports_and_imports_every_option() {
        let secrets = InMemoryStore::new();
        secrets.set("a", SecretKind::Password, "s3cret").unwrap();
        let dir =
            std::env::temp_dir().join(format!("rabbit-studio-conn-io-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("out.json");
        export_connections(&[profile("a", "Prod")], true, &secrets, &path).unwrap();
        let parsed = parse_connections_file(&std::fs::read_to_string(&path).unwrap()).unwrap();
        let entry = parsed.into_iter().next().unwrap().unwrap();
        assert_eq!(entry.input.name, "Prod");
        assert_eq!(entry.input.password.as_deref(), Some("s3cret"));
        assert_eq!(entry.input.environment, Environment::Production);
        assert!(entry.input.tls.enabled);
        assert!(entry.input.advanced.read_only);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rejects_other_files() {
        assert!(parse_connections_file(r#"{"Servers": {}}"#).is_err());
    }
}
