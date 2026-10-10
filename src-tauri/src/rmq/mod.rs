//! A connection to a RabbitMQ cluster: its management API over HTTP, and,
//! for what that API can't do, AMQP 0-9-1 (`amqp`).

pub mod amqp;
pub mod message;

use std::sync::Arc;
use std::time::Duration;

use reqwest::{Method, Url};
use serde_json::Value;
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::models::{ConnectionProfile, SshAuthMethod, DEFAULT_MGMT_PORT};
use crate::secrets::{SecretKind, SecretStore};
use crate::ssh_tunnel::{self, KnownHosts, SshTunnel, SshTunnelAuth, SshTunnelConfig};

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(15);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(6);

/// What the server says about itself when the app connects.
#[derive(Debug, Clone, Default)]
pub struct ServerInfo {
    pub version: Option<String>,
    pub management_version: Option<String>,
    pub cluster_name: Option<String>,
    pub erlang_version: Option<String>,
    pub user: String,
    pub tags: Vec<String>,
}

/// Where AMQP operations connect, credentials included (never logged).
#[derive(Clone)]
pub struct AmqpTarget {
    pub host: String,
    pub port: u16,
    pub tls: bool,
    pub user: String,
    pub password: String,
}

impl AmqpTarget {
    /// The URI of `vhost` on this target.
    pub fn uri(&self, vhost: &str) -> String {
        let scheme = if self.tls { "amqps" } else { "amqp" };
        let enc = |s: &str| urlencoding::encode(s).into_owned();
        format!(
            "{scheme}://{}:{}@{}:{}/{}?heartbeat=30&connection_timeout=8000",
            enc(&self.user),
            enc(&self.password),
            self.host,
            self.port,
            enc(vhost)
        )
    }
}

pub struct RabbitSession {
    pub name: String,
    http: reqwest::Client,
    /// `scheme://host:port[/prefix]/api`
    api: String,
    user: String,
    password: Option<String>,
    pub read_only: bool,
    pub amqp: Option<AmqpTarget>,
    tunnels: Mutex<Vec<SshTunnel>>,
}

/// The parts of a management URL the session needs.
struct Endpoint {
    url: Url,
    host: String,
    port: u16,
}

fn parse_endpoint(base: &str) -> AppResult<Endpoint> {
    let url = Url::parse(base)
        .map_err(|e| AppError::InvalidInput(format!("invalid management URL: {e}")))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(AppError::InvalidInput(
            "the management URL must start with http:// or https://".to_string(),
        ));
    }
    let host = url
        .host_str()
        .ok_or_else(|| AppError::InvalidInput("the management URL has no host".to_string()))?
        .trim_matches(['[', ']'])
        .to_string();
    let port = url.port_or_known_default().unwrap_or(DEFAULT_MGMT_PORT);
    Ok(Endpoint { url, host, port })
}

impl RabbitSession {
    pub async fn connect(
        profile: &ConnectionProfile,
        secrets: &dyn SecretStore,
        known_hosts: &Arc<KnownHosts>,
    ) -> AppResult<(Self, ServerInfo)> {
        let password = if profile.has_password {
            let saved = secrets
                .get(&profile.id, SecretKind::Password)
                .map_err(AppError::Secret)?;
            Some(saved.ok_or_else(|| {
                AppError::PasswordMissing(
                    "The saved password for this connection is missing from the system keychain. \
                     Edit the connection and enter it again."
                        .to_string(),
                )
            })?)
        } else {
            None
        };
        let user = profile.username.clone().unwrap_or_else(|| "guest".to_string());
        let endpoint = parse_endpoint(&profile.management_url())?;

        let mut tunnels = Vec::new();
        let mut resolve_to = None;
        let mut amqp_addr = profile.amqp.enabled.then(|| {
            (
                profile
                    .amqp
                    .host
                    .clone()
                    .filter(|h| !h.trim().is_empty())
                    .unwrap_or_else(|| endpoint.host.clone()),
                profile.amqp.port,
            )
        });
        if let Some(ssh) = profile.ssh_tunnel.as_ref().filter(|s| s.enabled) {
            let auth = tunnel_auth(profile, secrets, ssh.auth_method)?;
            let config = |remote_host: String, remote_port: u16| SshTunnelConfig {
                ssh_host: ssh.host.clone(),
                ssh_port: ssh.port,
                ssh_username: ssh.username.clone(),
                auth: auth.clone(),
                remote_host,
                remote_port,
            };
            let mgmt = ssh_tunnel::start_tunnel(
                config(endpoint.host.clone(), endpoint.port),
                known_hosts.clone(),
            )
            .await?;
            // The URL keeps its host name, so TLS still checks the right
            // certificate; only the address it resolves to changes.
            resolve_to = Some(mgmt.local_addr);
            tunnels.push(mgmt);
            if let Some((host, port)) = amqp_addr.take() {
                match ssh_tunnel::start_tunnel(config(host, port), known_hosts.clone()).await {
                    Ok(t) => {
                        amqp_addr = Some(("127.0.0.1".to_string(), t.local_addr.port()));
                        tunnels.push(t);
                    }
                    Err(e) => log::warn!("no AMQP tunnel for \"{}\": {e}", profile.name),
                }
            }
        }

        let http = match build_client(profile, &endpoint, resolve_to) {
            Ok(c) => c,
            Err(e) => {
                for t in tunnels {
                    t.shutdown().await;
                }
                return Err(e);
            }
        };
        let mut api = endpoint.url.to_string();
        while api.ends_with('/') {
            api.pop();
        }
        api.push_str("/api");
        let session = Self {
            name: profile.name.clone(),
            http,
            api,
            user: user.clone(),
            password: password.clone(),
            read_only: profile.advanced.read_only,
            amqp: amqp_addr.map(|(host, port)| AmqpTarget {
                host,
                port,
                tls: profile.amqp.tls,
                user: user.clone(),
                password: password.clone().unwrap_or_default(),
            }),
            tunnels: Mutex::new(tunnels),
        };
        match session.server_info().await {
            Ok(info) => Ok((session, info)),
            Err(e) => {
                session.shutdown().await;
                Err(e)
            }
        }
    }

    async fn server_info(&self) -> AppResult<ServerInfo> {
        let overview: Value = serde_json::from_slice(
            &self
                .request(Method::GET, "overview?columns=rabbitmq_version,management_version,cluster_name,erlang_version", None)
                .await?,
        )
        .map_err(|e| AppError::Http(format!("the server's overview isn't JSON: {e}")))?;
        let whoami: Value =
            serde_json::from_slice(&self.request(Method::GET, "whoami", None).await?)
                .unwrap_or(Value::Null);
        let text = |v: &Value, k: &str| v.get(k).and_then(Value::as_str).map(str::to_string);
        // An array since 3.9, a comma-separated string before.
        let tags = match whoami.get("tags") {
            Some(Value::Array(a)) => a.iter().filter_map(|t| t.as_str().map(str::to_string)).collect(),
            Some(Value::String(s)) => s
                .split(',')
                .map(str::trim)
                .filter(|t| !t.is_empty())
                .map(str::to_string)
                .collect(),
            _ => Vec::new(),
        };
        Ok(ServerInfo {
            version: text(&overview, "rabbitmq_version"),
            management_version: text(&overview, "management_version"),
            cluster_name: text(&overview, "cluster_name"),
            erlang_version: text(&overview, "erlang_version"),
            user: text(&whoami, "name").unwrap_or_else(|| self.user.clone()),
            tags,
        })
    }

    /// A management API call, `path` relative to `/api/` and already
    /// percent-encoded. Returns the response body as it came.
    pub async fn request(
        &self,
        method: Method,
        path: &str,
        body: Option<&Value>,
    ) -> AppResult<Vec<u8>> {
        let path = path.trim_start_matches('/');
        if path.split(['/', '?']).any(|seg| seg == "..") {
            return Err(AppError::InvalidInput(format!("bad API path {path}")));
        }
        if self.read_only && !allowed_when_read_only(&method, path, body) {
            return Err(AppError::ReadOnly(format!(
                "\"{}\" is read-only: nothing that changes the broker can be done on it",
                self.name
            )));
        }
        let url = format!("{}/{path}", self.api);
        let mut req = self
            .http
            .request(method, &url)
            .basic_auth(&self.user, self.password.as_deref());
        if let Some(body) = body {
            req = req.json(body);
        }
        let response = req.send().await.map_err(|e| http_error(&e))?;
        let status = response.status();
        let bytes = response.bytes().await.map_err(|e| http_error(&e))?;
        if status.is_success() {
            // Zero-copy when the buffer is not shared.
            return Ok(Vec::from(bytes));
        }
        Err(server_error(status.as_u16(), &bytes, &self.user))
    }

    pub async fn get_json(&self, path: &str) -> AppResult<Value> {
        let bytes = self.request(Method::GET, path, None).await?;
        if bytes.is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_slice(&bytes).map_err(|e| AppError::Http(format!("not JSON: {e}")))
    }

    pub async fn shutdown(&self) {
        let tunnels = std::mem::take(&mut *self.tunnels.lock().await);
        for t in tunnels {
            t.shutdown().await;
        }
    }
}

/// Reads, and peeking at messages (which puts them back).
fn allowed_when_read_only(method: &Method, path: &str, body: Option<&Value>) -> bool {
    if *method == Method::GET {
        return true;
    }
    let path = path.split('?').next().unwrap_or_default();
    *method == Method::POST
        && path.starts_with("queues/")
        && path.ends_with("/get")
        && body
            .and_then(|b| b.get("ackmode"))
            .and_then(Value::as_str)
            == Some("ack_requeue_true")
}

fn tunnel_auth(
    profile: &ConnectionProfile,
    secrets: &dyn SecretStore,
    method: SshAuthMethod,
) -> AppResult<SshTunnelAuth> {
    Ok(match method {
        SshAuthMethod::Password => SshTunnelAuth::Password(
            secrets
                .get(&profile.id, SecretKind::SshPassword)
                .map_err(AppError::Secret)?
                .ok_or_else(|| AppError::InvalidInput("SSH password not set".to_string()))?,
        ),
        SshAuthMethod::PrivateKey => {
            let ssh = profile.ssh_tunnel.as_ref();
            let path = ssh
                .and_then(|s| s.private_key_path.clone())
                .ok_or_else(|| AppError::InvalidInput("SSH private key path not set".to_string()))?;
            let passphrase = if ssh.is_some_and(|s| s.private_key_has_passphrase) {
                secrets
                    .get(&profile.id, SecretKind::SshKeyPassphrase)
                    .map_err(AppError::Secret)?
            } else {
                None
            };
            SshTunnelAuth::PrivateKey { path, passphrase }
        }
        SshAuthMethod::Agent => SshTunnelAuth::Agent,
    })
}

fn build_client(
    profile: &ConnectionProfile,
    endpoint: &Endpoint,
    resolve_to: Option<std::net::SocketAddr>,
) -> AppResult<reqwest::Client> {
    let timeout = profile
        .advanced
        .request_timeout_ms
        .map(Duration::from_millis)
        .unwrap_or(DEFAULT_TIMEOUT);
    let mut builder = reqwest::Client::builder()
        .user_agent(concat!("RabbitStudio/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(timeout)
        .pool_idle_timeout(Duration::from_secs(60))
        .pool_max_idle_per_host(4)
        .tcp_nodelay(true)
        .no_proxy();
    if let Some(addr) = resolve_to {
        builder = builder.resolve(&endpoint.host, addr);
    }
    let tls = &profile.tls;
    if let Some(ca) = tls.ca_file.as_deref().filter(|p| !p.is_empty()) {
        let pem = std::fs::read(ca)
            .map_err(|e| AppError::InvalidInput(format!("can't read the CA file {ca}: {e}")))?;
        for cert in reqwest::Certificate::from_pem_bundle(&pem)
            .map_err(|e| AppError::InvalidInput(format!("the CA file {ca} isn't PEM: {e}")))?
        {
            builder = builder.add_root_certificate(cert);
        }
    }
    if let (Some(cert), Some(key)) = (
        tls.cert_file.as_deref().filter(|p| !p.is_empty()),
        tls.key_file.as_deref().filter(|p| !p.is_empty()),
    ) {
        let mut pem = std::fs::read(cert)
            .map_err(|e| AppError::InvalidInput(format!("can't read {cert}: {e}")))?;
        pem.push(b'\n');
        pem.extend(
            std::fs::read(key).map_err(|e| AppError::InvalidInput(format!("can't read {key}: {e}")))?,
        );
        let identity = reqwest::Identity::from_pem(&pem)
            .map_err(|e| AppError::InvalidInput(format!("the client certificate: {e}")))?;
        builder = builder.identity(identity);
    }
    if tls.allow_invalid_certificates {
        builder = builder.danger_accept_invalid_certs(true);
    }
    builder
        .build()
        .map_err(|e| AppError::Http(format!("can't set up the HTTP client: {e}")))
}

fn http_error(e: &reqwest::Error) -> AppError {
    let mut text = e.to_string();
    let mut source = std::error::Error::source(e);
    // reqwest's own message is generic; the cause says what went wrong.
    while let Some(s) = source {
        text = s.to_string();
        source = s.source();
    }
    if e.is_timeout() {
        AppError::Http("the management API didn't answer in time".to_string())
    } else if e.is_connect() {
        AppError::Http(format!("can't reach the management API: {text}"))
    } else {
        AppError::Http(text)
    }
}

fn server_error(status: u16, body: &[u8], user: &str) -> AppError {
    let parsed: Option<Value> = serde_json::from_slice(body).ok();
    let field = |k: &str| {
        parsed
            .as_ref()
            .and_then(|v| v.get(k))
            .and_then(Value::as_str)
            .map(str::to_string)
    };
    let message = match status {
        401 => format!("Login failed for user \"{user}\": wrong user name or password, or the user can't use the management API"),
        403 => field("reason").unwrap_or_else(|| format!("\"{user}\" isn't allowed to do this")),
        _ => field("reason")
            .or_else(|| field("error"))
            .unwrap_or_else(|| format!("the server answered HTTP {status}")),
    };
    AppError::Server { status, message }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn read_only_allows_reads_and_peeks_only() {
        let peek = json!({"count": 5, "ackmode": "ack_requeue_true"});
        let get = json!({"count": 5, "ackmode": "ack_requeue_false"});
        assert!(allowed_when_read_only(&Method::GET, "queues", None));
        assert!(allowed_when_read_only(&Method::POST, "queues/%2F/q/get", Some(&peek)));
        assert!(!allowed_when_read_only(&Method::POST, "queues/%2F/q/get", Some(&get)));
        assert!(!allowed_when_read_only(&Method::DELETE, "queues/%2F/q/contents", None));
        assert!(!allowed_when_read_only(&Method::POST, "exchanges/%2F/x/publish", Some(&peek)));
    }

    #[test]
    fn endpoints_keep_their_prefix() {
        let e = parse_endpoint("https://mq.example.com/rabbitmq/").unwrap();
        assert_eq!(e.host, "mq.example.com");
        assert_eq!(e.port, 443);
        assert_eq!(e.url.path(), "/rabbitmq/");
        assert!(parse_endpoint("amqp://mq:5672").is_err());
    }

    #[test]
    fn errors_use_the_server_reason() {
        let e = server_error(404, br#"{"error":"Object Not Found","reason":"Not Found"}"#, "u");
        assert_eq!(e.to_string(), "Not Found");
        let e = server_error(401, b"", "alice");
        assert!(e.to_string().contains("alice"));
    }

    #[test]
    fn amqp_uris_encode_the_vhost() {
        let t = AmqpTarget {
            host: "mq".into(),
            port: 5672,
            tls: false,
            user: "a@b".into(),
            password: "p/w".into(),
        };
        assert!(t.uri("/").starts_with("amqp://a%40b:p%2Fw@mq:5672/%2F?"));
    }
}
