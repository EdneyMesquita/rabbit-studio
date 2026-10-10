use std::sync::Arc;
use std::time::Instant;

use reqwest::Method;
use tauri::{AppHandle, Emitter, Runtime, State};
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

use crate::connection::extract_uri_credentials;
use crate::connections_io;
use crate::error::{AppError, AppResult};
use crate::logging::{self, logged};
use crate::models::{
    validate_color, ConnectionHandle, ConnectionImportPreview, ConnectionProfile,
    ConnectionProfileInput, ConnectionProfileMeta, ConnectionSource, ConnectionTestResult,
    ConnectionsExportSummary, ConnectionsImportSummary, SecretBackendInfo, SecretBackendKind,
};
use crate::rmq::amqp::{self, StreamOffset, TransferInput, TransferProgress, TransferSummary};
use crate::rmq::{message, RabbitSession};
use crate::secrets::SecretKind;
use crate::sidebar_layout::SidebarLayoutStore;
use crate::state::{AppState, CancelToken};

/// The event a message transfer reports its progress with.
pub const TRANSFER_EVENT: &str = "transfer-progress";

fn now_iso() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    // A plain Unix-epoch-seconds timestamp; good enough for created/updated
    // bookkeeping without pulling in a datetime-formatting crate.
    format!("{}", now.as_secs())
}

/// Turns a submitted profile form into persisted metadata, writing any
/// secret fields (password, SSH passphrases) to the secret store and
/// stripping them from what gets written to `connections.json`.
async fn materialize_profile(
    state: &AppState,
    input: ConnectionProfileInput,
) -> AppResult<ConnectionProfile> {
    // Before any secret is written, so a bad color leaves nothing behind.
    validate_color(input.color.as_deref())?;
    let id = input.id.clone().unwrap_or_default();
    let id = if id.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        id
    };

    let (source, mut username, extracted_password) = match input.source {
        ConnectionSource::Uri { uri } => {
            let (stripped, user, pass) = extract_uri_credentials(uri.trim());
            (ConnectionSource::Uri { uri: stripped }, user, pass)
        }
        manual @ ConnectionSource::Manual { .. } => (manual, None, None),
    };
    if input.username.as_deref().is_some_and(|u| !u.is_empty()) {
        username = input.username;
    }
    let password = input.password.or(extracted_password);

    let has_password = if let Some(password) = &password {
        state
            .secret_store
            .set(&id, SecretKind::Password, password)
            .map_err(AppError::Secret)?;
        true
    } else {
        // Editing a saved connection with the password left blank keeps the
        // one already stored, rather than silently dropping it.
        state
            .connection_store
            .get(&id)
            .is_ok_and(|saved| saved.has_password)
    };

    let mut oauth2 = input.oauth2;
    if let Some(secret) = input.oauth2_client_secret.as_deref().filter(|s| !s.is_empty()) {
        state
            .secret_store
            .set(&id, SecretKind::OAuth2ClientSecret, secret)
            .map_err(AppError::Secret)?;
        oauth2.has_secret = true;
    } else {
        // Blank on an edit keeps the saved secret.
        oauth2.has_secret |= state
            .connection_store
            .get(&id)
            .is_ok_and(|saved| saved.oauth2.has_secret);
    }

    let mut ssh_tunnel = input.ssh_tunnel;
    if let Some(ssh) = &mut ssh_tunnel {
        if let Some(password) = &input.ssh_password {
            state
                .secret_store
                .set(&id, SecretKind::SshPassword, password)
                .map_err(AppError::Secret)?;
        }
        if let Some(passphrase) = &input.ssh_key_passphrase {
            state
                .secret_store
                .set(&id, SecretKind::SshKeyPassphrase, passphrase)
                .map_err(AppError::Secret)?;
            ssh.private_key_has_passphrase = true;
        }
    }

    let created_at = state
        .connection_store
        .get(&id)
        .map(|p| p.created_at)
        .unwrap_or_else(|_| now_iso());

    Ok(ConnectionProfile {
        id,
        name: input.name,
        color: input.color,
        environment: input.environment,
        source,
        auth: input.auth,
        oauth2,
        username,
        has_password,
        tls: input.tls,
        amqp: input.amqp,
        ssh_tunnel,
        advanced: input.advanced,
        created_at,
        updated_at: now_iso(),
    })
}

#[tauri::command]
pub fn list_connection_profiles(state: State<AppState>) -> Vec<ConnectionProfileMeta> {
    state
        .connection_store
        .list()
        .iter()
        .map(ConnectionProfileMeta::from)
        .collect()
}

#[tauri::command]
pub fn get_connection_profile(state: State<AppState>, id: String) -> AppResult<ConnectionProfile> {
    logged("get_connection_profile", state.connection_store.get(&id))
}

/// `"prod" (3f2a...)`: how log lines name a saved connection.
fn connection_label(profile: &ConnectionProfile) -> String {
    format!("\"{}\" ({})", profile.name, profile.id)
}

fn yes_no(value: bool) -> &'static str {
    if value {
        "yes"
    } else {
        "no"
    }
}

#[tauri::command]
pub async fn save_connection_profile(
    state: State<'_, AppState>,
    input: ConnectionProfileInput,
) -> AppResult<ConnectionProfileMeta> {
    let saved = async {
        let profile = materialize_profile(&state, input).await?;
        state.connection_store.upsert(profile)
    }
    .await;
    let saved = logged("save_connection_profile", saved)?;
    log::info!(
        "saved connection {} at {}; password saved: {}",
        connection_label(&saved),
        logging::route(&saved),
        yes_no(saved.has_password)
    );
    Ok(ConnectionProfileMeta::from(&saved))
}

#[tauri::command]
pub async fn delete_connection_profile(state: State<'_, AppState>, id: String) -> AppResult<()> {
    logged(
        "delete_connection_profile",
        state.connection_store.delete(&id),
    )?;
    let _ = state.secret_store.delete_all(&id);
    log::info!("deleted connection {id}");
    Ok(())
}

#[tauri::command]
pub async fn export_connections(
    state: State<'_, AppState>,
    dest_path: String,
    include_secrets: bool,
) -> AppResult<ConnectionsExportSummary> {
    let profiles = state.connection_store.list();
    let exported = logged(
        "export_connections",
        connections_io::export_connections(
            &profiles,
            include_secrets,
            state.secret_store.as_ref(),
            std::path::Path::new(&dest_path),
        ),
    )?;
    log::info!(
        "exported {exported} connections; secrets included: {}",
        yes_no(include_secrets)
    );
    Ok(ConnectionsExportSummary { exported })
}

/// Lists what an import file holds, without saving anything, so the user
/// can pick which connections to import.
#[tauri::command]
pub async fn preview_connections_import(
    state: State<'_, AppState>,
    src_path: String,
) -> AppResult<Vec<ConnectionImportPreview>> {
    logged(
        "preview_connections_import",
        std::fs::read_to_string(&src_path)
            .map_err(AppError::from)
            .and_then(|raw| preview_import(&state, &raw)),
    )
}

fn preview_import(state: &AppState, raw: &str) -> AppResult<Vec<ConnectionImportPreview>> {
    let existing: std::collections::HashSet<String> = state
        .connection_store
        .list()
        .into_iter()
        .map(|p| p.name)
        .collect();
    Ok(connections_io::parse_connections_file(raw)?
        .into_iter()
        .enumerate()
        .map(|(index, entry)| match entry {
            Ok(entry) => ConnectionImportPreview {
                index,
                exists: existing.contains(&entry.input.name),
                address: entry.address(),
                name: entry.input.name,
                warning: entry.warning,
                error: None,
            },
            Err(message) => ConnectionImportPreview {
                index,
                name: String::new(),
                address: String::new(),
                warning: None,
                error: Some(message),
                exists: false,
            },
        })
        .collect())
}

/// Imports the connections at `selected` positions of the file (see
/// `preview_connections_import`), or all of them when it's absent.
#[tauri::command]
pub async fn import_connections(
    state: State<'_, AppState>,
    src_path: String,
    selected: Option<Vec<usize>>,
) -> AppResult<ConnectionsImportSummary> {
    let summary = async {
        import_file(
            &state,
            &std::fs::read_to_string(&src_path)?,
            selected.as_deref(),
        )
        .await
    }
    .await;
    let summary = logged("import_connections", summary)?;
    log::info!(
        "imported {} connections, {} skipped with errors, {} with warnings",
        summary.imported,
        summary.errors.len(),
        summary.warnings.len()
    );
    // Names and what went wrong, never a connection string or password.
    for error in &summary.errors {
        log::warn!("import error: {error}");
    }
    for warning in &summary.warnings {
        log::warn!("import warning: {warning}");
    }
    Ok(summary)
}

async fn import_file(
    state: &AppState,
    raw: &str,
    selected: Option<&[usize]>,
) -> AppResult<ConnectionsImportSummary> {
    let parsed = connections_io::parse_connections_file(raw)?;

    let mut imported = 0;
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    for (index, entry) in parsed.into_iter().enumerate() {
        if selected.is_some_and(|picked| !picked.contains(&index)) {
            continue;
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(message) => {
                errors.push(message);
                continue;
            }
        };
        if let Some(warning) = entry.warning {
            warnings.push(format!("{}: {warning}", entry.input.name));
        }
        let profile = materialize_profile(state, entry.input).await?;
        let saved = state.connection_store.upsert(profile)?;
        // Whether a password came along is what "imported connections
        // can't log in" comes down to.
        log::info!(
            "imported connection {} at {}; user set: {}, password saved: {}",
            connection_label(&saved),
            logging::route(&saved),
            yes_no(saved.username.is_some()),
            yes_no(saved.has_password)
        );
        imported += 1;
    }

    Ok(ConnectionsImportSummary {
        imported,
        errors,
        warnings,
    })
}

#[tauri::command]
pub async fn test_connection(
    state: State<'_, AppState>,
    input: ConnectionProfileInput,
) -> AppResult<ConnectionTestResult> {
    test_profile(&state, input).await
}

/// Tests the connection a form describes without touching saved secrets.
///
/// Materializing a profile writes its secrets to the store, so doing that
/// under the profile's own id would overwrite a saved password with
/// whatever was typed into an edit form that is then cancelled - and a
/// never-saved connection would leave its secrets behind. Instead the test
/// runs under a throwaway id, borrowing the saved secrets the form left
/// blank, and everything stored under that id is removed afterwards.
async fn test_profile(
    state: &AppState,
    mut input: ConnectionProfileInput,
) -> AppResult<ConnectionTestResult> {
    let saved = input
        .id
        .as_deref()
        .filter(|id| !id.is_empty())
        .and_then(|id| state.connection_store.get(id).ok());
    let temp_id = format!("connection-test-{}", Uuid::new_v4());
    let label = format!(
        "\"{}\" ({})",
        input.name,
        saved.as_ref().map_or("unsaved", |s| s.id.as_str())
    );
    let started = Instant::now();

    let result = async {
        if let Some(saved) = &saved {
            for kind in SecretKind::ALL {
                if let Some(value) = state
                    .secret_store
                    .get(&saved.id, kind)
                    .map_err(AppError::Secret)?
                {
                    state
                        .secret_store
                        .set(&temp_id, kind, &value)
                        .map_err(AppError::Secret)?;
                }
            }
        }
        input.id = Some(temp_id.clone());
        let mut profile = materialize_profile(state, input).await?;
        // A blank password field means the saved one, copied over above.
        profile.has_password |= saved.as_ref().is_some_and(|s| s.has_password);
        let tested =
            RabbitSession::connect(&profile, state.secret_store.as_ref(), &state.known_hosts).await;
        let tested = match tested {
            Ok((session, info)) => {
                let amqp_reachable = match session.amqp_target().await.ok().flatten() {
                    Some(t) => Some(amqp::reachable(&t.host, t.port).await),
                    None => None,
                };
                session.shutdown().await;
                ConnectionTestResult {
                    success: true,
                    message: match &info.cluster_name {
                        Some(c) => format!("Connected to {c} as {}", info.user),
                        None => format!("Connected as {}", info.user),
                    },
                    server_version: info.version,
                    cluster_name: info.cluster_name,
                    amqp_reachable,
                }
            }
            Err(e) => ConnectionTestResult {
                success: false,
                message: e.to_string(),
                server_version: None,
                cluster_name: None,
                amqp_reachable: None,
            },
        };
        Ok((tested, logging::route(&profile)))
    }
    .await;

    let _ = state.secret_store.delete_all(&temp_id);
    let ms = started.elapsed().as_millis();
    let (tested, route) = logged(&format!("testing connection {label}"), result)?;
    if tested.success {
        log::info!(
            "connection test of {label} at {route} succeeded in {ms} ms; server {}",
            tested
                .server_version
                .as_deref()
                .unwrap_or("version unknown")
        );
    } else {
        log::warn!(
            "connection test of {label} at {route} failed after {ms} ms: {}",
            logging::scrub_credentials(&tested.message)
        );
    }
    Ok(tested)
}

#[tauri::command]
pub async fn connect(state: State<'_, AppState>, id: String) -> AppResult<ConnectionHandle> {
    let profile = logged("connect", state.connection_store.get(&id))?;
    let target = format!(
        "{} at {}",
        connection_label(&profile),
        logging::route(&profile)
    );
    log::info!("connecting to {target}");
    let started = Instant::now();
    let session =
        RabbitSession::connect(&profile, state.secret_store.as_ref(), &state.known_hosts).await;
    let ms = started.elapsed().as_millis();
    let (session, info) = logged(&format!("connecting to {target} ({ms} ms)"), session)?;
    let session_id = Uuid::new_v4().to_string();
    log::info!(
        "connected to {target} in {ms} ms; RabbitMQ {}; session {session_id}",
        info.version.as_deref().unwrap_or("version unknown")
    );
    let handle = ConnectionHandle {
        session_id: session_id.clone(),
        server_version: info.version,
        management_version: info.management_version,
        cluster_name: info.cluster_name,
        erlang_version: info.erlang_version,
        user: info.user,
        tags: info.tags,
        read_only: session.read_only,
        amqp: session.has_amqp(),
    };
    state
        .sessions
        .write()
        .await
        .insert(session_id, Arc::new(session));
    Ok(handle)
}

#[tauri::command]
pub async fn disconnect(state: State<'_, AppState>, session_id: String) -> AppResult<()> {
    let session = state.sessions.write().await.remove(&session_id);
    match session {
        Some(session) => {
            session.shutdown().await;
            log::info!("disconnected \"{}\"; session {session_id}", session.name);
            Ok(())
        }
        None => logged("disconnect", Err(AppError::SessionNotFound(session_id))),
    }
}

#[tauri::command]
pub fn secret_backend_info(state: State<AppState>) -> SecretBackendInfo {
    let warning = match state.secret_backend {
        SecretBackendKind::Keyring => None,
        SecretBackendKind::EncryptedFile => Some(
            "No OS keychain was found (common on headless Linux). Secrets are encrypted at \
             rest on disk instead, which is less secure than a real system keychain."
                .to_string(),
        ),
    };
    SecretBackendInfo {
        backend: state.secret_backend,
        warning,
    }
}

/// The live session behind `session_id`.
pub(crate) async fn session(state: &AppState, session_id: &str) -> AppResult<Arc<RabbitSession>> {
    state
        .sessions
        .read()
        .await
        .get(session_id)
        .cloned()
        .ok_or_else(|| AppError::SessionNotFound(session_id.to_string()))
}

fn method(name: &str) -> AppResult<Method> {
    match name {
        "GET" => Ok(Method::GET),
        "PUT" => Ok(Method::PUT),
        "POST" => Ok(Method::POST),
        "DELETE" => Ok(Method::DELETE),
        other => Err(AppError::InvalidInput(format!("unsupported method {other}"))),
    }
}

/// A management API call, `path` relative to `/api/`. The body comes back
/// as the server sent it - raw bytes, parsed once by the page - so a list
/// of thousands of queues isn't decoded and encoded again on the way.
#[tauri::command]
pub async fn mgmt(
    state: State<'_, AppState>,
    session_id: String,
    method_name: String,
    path: String,
    body: Option<serde_json::Value>,
) -> AppResult<tauri::ipc::Response> {
    let session = session(&state, &session_id).await?;
    let method = method(&method_name)?;
    let started = Instant::now();
    let result = session.request(method.clone(), &path, body.as_ref()).await;
    let elapsed = started.elapsed();
    // The path names objects, never message contents or credentials.
    let op = path.split('?').next().unwrap_or_default();
    match &result {
        Err(e) if !matches!(e, AppError::Server { status: 404, .. }) => log::warn!(
            "{method_name} {op} [{}] failed after {} ms: {}",
            session.name,
            elapsed.as_millis(),
            logging::describe(e, logging::Detail::Full)
        ),
        Ok(_) if elapsed.as_secs() >= 5 => log::warn!(
            "{method_name} {op} [{}] was slow: {} ms",
            session.name,
            elapsed.as_millis()
        ),
        _ => {}
    }
    if method != Method::GET && result.is_ok() {
        log::info!("{method_name} {op} [{}]", session.name);
    }
    result.map(tauri::ipc::Response::new)
}

/// Reads messages off the head of a queue through the management API, each
/// with the fingerprint a later move or replay picks it by. With `requeue`
/// they go back (a peek); without, they are taken off the queue.
#[tauri::command]
pub async fn get_messages(
    state: State<'_, AppState>,
    session_id: String,
    vhost: String,
    queue: String,
    count: u32,
    requeue: bool,
    truncate: Option<u32>,
) -> AppResult<serde_json::Value> {
    let session = session(&state, &session_id).await?;
    let path = format!(
        "queues/{}/{}/get",
        urlencoding::encode(&vhost),
        urlencoding::encode(&queue)
    );
    let body = serde_json::json!({
        "count": count,
        "ackmode": if requeue { "ack_requeue_true" } else { "ack_requeue_false" },
        "encoding": "auto",
        "truncate": truncate.unwrap_or(50_000),
    });
    let raw = logged(
        "get_messages",
        session.request(Method::POST, &path, Some(&body)).await,
    )?;
    let mut messages: serde_json::Value = serde_json::from_slice(&raw)
        .map_err(|e| AppError::Http(format!("the messages aren't JSON: {e}")))?;
    message::fingerprint_http(&mut messages);
    Ok(messages)
}

fn track(state: &AppState, execution_id: &str) -> CancelToken {
    let token = CancelToken::default();
    state
        .running_tasks
        .lock()
        .unwrap()
        .insert(execution_id.to_string(), token.clone());
    token
}

fn forget(state: &AppState, execution_id: &str) {
    state.running_tasks.lock().unwrap().remove(execution_id);
}

#[tauri::command]
pub async fn cancel_task(state: State<'_, AppState>, execution_id: String) -> AppResult<()> {
    if let Some(token) = state.running_tasks.lock().unwrap().get(&execution_id) {
        token.cancel();
    }
    Ok(())
}

async fn amqp_target(session: &RabbitSession) -> AppResult<crate::rmq::AmqpTarget> {
    session.amqp_target().await?.ok_or_else(|| {
        AppError::InvalidInput(
            "This needs AMQP access, which is off for this connection. Turn it on in the \
             connection's Advanced settings."
                .to_string(),
        )
    })
}

/// Moves, replays or deletes messages over AMQP; see `amqp::transfer`.
#[tauri::command]
pub async fn transfer_messages<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    session_id: String,
    execution_id: String,
    input: TransferInput,
) -> AppResult<TransferSummary> {
    let session = session(&state, &session_id).await?;
    if session.read_only {
        return Err(AppError::ReadOnly(format!(
            "\"{}\" is read-only: messages can't be moved or deleted on it",
            session.name
        )));
    }
    let target = amqp_target(&session).await?;
    let token = track(&state, &execution_id);
    let what = format!("{:?} from {} in {}", input.target, input.queue, input.vhost);
    let id = execution_id.clone();
    let result = amqp::transfer(&target, input, token, |done, total| {
        let _ = app.emit(
            TRANSFER_EVENT,
            TransferProgress {
                execution_id: id.clone(),
                done,
                total,
            },
        );
    })
    .await;
    forget(&state, &execution_id);
    let summary = logged(&format!("transfer {what} [{}]", session.name), result)?;
    log::info!(
        "transfer {what} [{}]: {} done, {} skipped, {} failed, {} missing{}",
        session.name,
        summary.done,
        summary.skipped,
        summary.failed,
        summary.missing,
        if summary.cancelled { " (cancelled)" } else { "" }
    );
    Ok(summary)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn read_stream(
    state: State<'_, AppState>,
    session_id: String,
    execution_id: String,
    vhost: String,
    queue: String,
    offset: StreamOffset,
    count: u16,
    truncate: Option<u32>,
) -> AppResult<Vec<serde_json::Value>> {
    let session = session(&state, &session_id).await?;
    let target = amqp_target(&session).await?;
    let token = track(&state, &execution_id);
    let result = amqp::read_stream(
        &target,
        &vhost,
        &queue,
        offset,
        count,
        truncate.unwrap_or(50_000) as usize,
        token,
    )
    .await;
    forget(&state, &execution_id);
    logged("read_stream", result)
}

/// Writes the broker's definitions (or a vhost's) to a file.
#[tauri::command]
pub async fn export_definitions(
    state: State<'_, AppState>,
    session_id: String,
    vhost: Option<String>,
    dest_path: String,
) -> AppResult<u64> {
    let session = session(&state, &session_id).await?;
    let path = match &vhost {
        Some(v) => format!("definitions/{}", urlencoding::encode(v)),
        None => "definitions".to_string(),
    };
    let result = async {
        let defs = session.get_json(&path).await?;
        let raw = serde_json::to_vec_pretty(&defs)
            .map_err(|e| AppError::InvalidInput(e.to_string()))?;
        std::fs::write(&dest_path, &raw)?;
        Ok(raw.len() as u64)
    }
    .await;
    logged("export_definitions", result)
}

/// Loads a definitions file into the broker (or a vhost), merging with
/// what is there, as the management UI's import does.
#[tauri::command]
pub async fn import_definitions(
    state: State<'_, AppState>,
    session_id: String,
    vhost: Option<String>,
    src_path: String,
) -> AppResult<()> {
    let session = session(&state, &session_id).await?;
    let result = async {
        let raw = std::fs::read_to_string(&src_path)?;
        let defs: serde_json::Value = serde_json::from_str(&raw)
            .map_err(|e| AppError::InvalidInput(format!("not a definitions file: {e}")))?;
        let path = match &vhost {
            Some(v) => format!("definitions/{}", urlencoding::encode(v)),
            None => "definitions".to_string(),
        };
        session.request(Method::POST, &path, Some(&defs)).await?;
        log::info!("imported definitions into \"{}\"", session.name);
        Ok(())
    }
    .await;
    logged("import_definitions", result)
}

/// Reads a text file the user picked (definitions preview, a payload).
#[tauri::command]
pub async fn read_text_file(path: String) -> AppResult<String> {
    logged("read_text_file", std::fs::read_to_string(&path).map_err(AppError::from))
}

/// Writes text to a file the user picked (exported messages).
#[tauri::command]
pub async fn write_text_file(path: String, contents: String) -> AppResult<()> {
    logged("write_text_file", std::fs::write(&path, contents).map_err(AppError::from))
}

/// The sidebar's folder tree, or null before one was saved.
#[tauri::command]
pub async fn get_sidebar_layout(
    store: State<'_, SidebarLayoutStore>,
) -> AppResult<serde_json::Value> {
    logged("get_sidebar_layout", store.get())
}

#[tauri::command]
pub async fn save_sidebar_layout(
    store: State<'_, SidebarLayoutStore>,
    layout: serde_json::Value,
) -> AppResult<()> {
    logged("save_sidebar_layout", store.save(&layout))
}

/// Opens the folder holding the app's log files in the OS file manager, and
/// returns its path. The error names the path too, so the user can still
/// find the folder when no file manager opens.
#[tauri::command]
pub async fn open_log_dir<R: Runtime>(app: AppHandle<R>) -> AppResult<String> {
    let opened = (|| {
        let dir = crate::logging::log_dir(&app).map_err(std::io::Error::other)?;
        std::fs::create_dir_all(&dir)?;
        let dir = dir.to_string_lossy().into_owned();
        app.opener().open_path(&dir, None::<&str>).map_err(|e| {
            std::io::Error::other(format!("couldn't open the logs folder ({dir}): {e}"))
        })?;
        Ok(dir)
    })();
    logged("open_log_dir", opened)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex};

    use tokio::sync::RwLock;

    use super::*;
    use crate::connection::ConnectionStore;
    use crate::secrets::{InMemoryStore, SecretStore};
    use crate::ssh_tunnel::KnownHosts;

    /// Lets a test keep a handle on the store AppState owns.
    struct Shared(Arc<InMemoryStore>);

    impl SecretStore for Shared {
        fn set(&self, id: &str, kind: SecretKind, value: &str) -> Result<(), String> {
            self.0.set(id, kind, value)
        }
        fn get(&self, id: &str, kind: SecretKind) -> Result<Option<String>, String> {
            self.0.get(id, kind)
        }
        fn delete(&self, id: &str, kind: SecretKind) -> Result<(), String> {
            self.0.delete(id, kind)
        }
    }

    fn state() -> (AppState, Arc<InMemoryStore>, PathBuf) {
        let dir = std::env::temp_dir().join(format!("rabbit-studio-commands-{}", Uuid::new_v4()));
        let secrets = Arc::new(InMemoryStore::new());
        let state = AppState {
            connection_store: ConnectionStore::load(&dir).unwrap(),
            secret_store: Box::new(Shared(secrets.clone())),
            secret_backend: SecretBackendKind::Keyring,
            known_hosts: Arc::new(KnownHosts::load(&dir).unwrap()),
            sessions: RwLock::new(HashMap::new()),
            running_tasks: Mutex::new(HashMap::new()),
        };
        (state, secrets, dir)
    }

    /// A server that refuses at once, so tests that try to connect fail fast.
    fn input(id: Option<String>, name: &str, password: Option<&str>) -> ConnectionProfileInput {
        ConnectionProfileInput {
            id,
            name: name.to_string(),
            color: None,
            environment: Default::default(),
            auth: Default::default(),
            oauth2: Default::default(),
            oauth2_client_secret: None,
            source: ConnectionSource::Uri {
                uri: "http://127.0.0.1:1".to_string(),
            },
            username: Some("alice".to_string()),
            password: password.map(str::to_string),
            tls: crate::models::TlsOptions::default(),
            amqp: Default::default(),
            ssh_tunnel: None,
            ssh_password: None,
            ssh_key_passphrase: None,
            advanced: crate::models::ConnectionAdvancedOptions::default(),
        }
    }

    async fn save(state: &AppState, input: ConnectionProfileInput) -> ConnectionProfile {
        let profile = materialize_profile(state, input).await.unwrap();
        state.connection_store.upsert(profile).unwrap()
    }

    const THREE_CONNECTIONS: &str = r#"{
        "type": "Rabbit Studio Connections",
        "version": 1,
        "connections": [
            { "name": "One", "source": { "kind": "uri", "uri": "http://bob:pw@one.example.net:15672" } },
            { "name": "prod", "source": { "kind": "manual", "host": "two.example.net", "port": 15672 } },
            { "name": "Three", "source": { "kind": "uri", "uri": "https://three.example.net/" } }
        ]
    }"#;

    #[tokio::test]
    async fn uri_credentials_move_to_the_profile() {
        let (state, secrets, dir) = state();
        let mut form = input(None, "mq", None);
        form.username = None;
        form.source = ConnectionSource::Uri {
            uri: "https://ops:s3cret@mq.example.com:15671/rabbit".to_string(),
        };
        let saved = save(&state, form).await;
        let ConnectionSource::Uri { uri } = &saved.source else {
            panic!("expected a URI source");
        };
        assert_eq!(uri, "https://mq.example.com:15671/rabbit");
        assert_eq!(saved.username.as_deref(), Some("ops"));
        assert!(saved.has_password);
        assert_eq!(
            secrets.get(&saved.id, SecretKind::Password).unwrap().as_deref(),
            Some("s3cret")
        );
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn preview_lists_the_file_without_saving_and_flags_existing_names() {
        let (state, _, dir) = state();
        save(&state, input(None, "prod", None)).await;

        let preview = preview_import(&state, THREE_CONNECTIONS).unwrap();

        let names: Vec<_> = preview.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(names, ["One", "prod", "Three"]);
        assert_eq!(
            preview.iter().map(|p| p.exists).collect::<Vec<_>>(),
            [false, true, false]
        );
        assert!(!preview[0].address.contains("pw"), "credentials are masked");
        assert_eq!(state.connection_store.list().len(), 1, "nothing saved");
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn import_takes_only_the_selected_connections() {
        let (state, _, dir) = state();

        let summary = import_file(&state, THREE_CONNECTIONS, Some(&[0, 2]))
            .await
            .unwrap();

        assert_eq!(summary.imported, 2);
        let mut names: Vec<_> = state
            .connection_store
            .list()
            .into_iter()
            .map(|p| p.name)
            .collect();
        names.sort();
        assert_eq!(names, ["One", "Three"]);
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn a_saved_color_round_trips_through_get_and_list() {
        let (state, _, dir) = state();
        let mut with_color = input(None, "prod", None);
        with_color.color = Some("#E5484D".to_string());

        let saved = save(&state, with_color).await;

        let fetched = state.connection_store.get(&saved.id).unwrap();
        assert_eq!(fetched.color.as_deref(), Some("#E5484D"));
        let meta: Vec<_> = state
            .connection_store
            .list()
            .iter()
            .map(ConnectionProfileMeta::from)
            .collect();
        assert_eq!(meta[0].color.as_deref(), Some("#E5484D"));
        let json = serde_json::to_value(&meta[0]).unwrap();
        assert_eq!(json["color"], "#E5484D");

        // back to automatic
        let mut cleared = input(Some(saved.id.clone()), "prod", None);
        cleared.color = None;
        assert_eq!(save(&state, cleared).await.color, None);
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn saving_rejects_a_color_that_is_not_hex() {
        let (state, secrets, dir) = state();
        for bad in ["red", "#E5484", "#E5484DFF", "E5484D1", "#GGGGGG", ""] {
            let mut bad_input = input(None, "prod", Some("pw"));
            bad_input.color = Some(bad.to_string());
            let err = materialize_profile(&state, bad_input).await.unwrap_err();
            assert!(matches!(err, AppError::InvalidInput(_)), "{bad}: {err}");
        }
        assert_eq!(secrets.len(), 0, "no secrets written for a rejected save");
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn editing_with_the_password_left_blank_keeps_the_saved_one() {
        let (state, _, dir) = state();
        let saved = save(&state, input(None, "prod", Some("s3cret"))).await;

        let edited = save(
            &state,
            input(Some(saved.id.clone()), "prod (renamed)", None),
        )
        .await;

        assert_eq!(edited.name, "prod (renamed)");
        assert!(edited.has_password);
        assert_eq!(
            state
                .secret_store
                .get(&saved.id, SecretKind::Password)
                .unwrap()
                .as_deref(),
            Some("s3cret")
        );
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn testing_an_edit_leaves_saved_secrets_alone() {
        let (state, secrets, dir) = state();
        let saved = save(&state, input(None, "prod", Some("s3cret"))).await;
        let before = secrets.len();

        // a wrong password typed into the edit form, then tested
        test_profile(&state, input(Some(saved.id.clone()), "prod", Some("wrong")))
            .await
            .unwrap();

        assert_eq!(
            state
                .secret_store
                .get(&saved.id, SecretKind::Password)
                .unwrap()
                .as_deref(),
            Some("s3cret")
        );
        assert_eq!(secrets.len(), before, "nothing left under the throwaway id");
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn testing_a_new_connection_leaves_no_secrets_behind() {
        let (state, secrets, dir) = state();

        test_profile(&state, input(None, "draft", Some("pw")))
            .await
            .unwrap();

        assert_eq!(secrets.len(), 0);
        assert!(state.connection_store.list().is_empty());
        std::fs::remove_dir_all(dir).ok();
    }
}
