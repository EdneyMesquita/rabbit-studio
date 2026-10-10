//! The app's log file, and the helpers that decide what goes into it.
//!
//! The log exists so a failure on someone else's machine - a connection
//! that times out over a VPN, an imported connection with no password -
//! can be diagnosed after the fact. It must never become a second place
//! where credentials or the user's data end up, so everything here logs
//! connection names, ids and hosts, never connection strings, and data
//! operations log what failed and where, never the filter or documents.

use std::sync::OnceLock;

use log::{Level, LevelFilter};
use tauri::plugin::TauriPlugin;
use tauri::{Manager, Runtime};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

use crate::error::{AppError, AppResult};
use crate::models::{ConnectionProfile, ConnectionSource};

/// The log file's name, without the `.log` the plugin adds.
const FILE_NAME: &str = "rabbit-studio";
/// Big enough to hold days of normal use, small enough to attach to an issue.
const MAX_FILE_SIZE: u128 = 5 * 1024 * 1024;
/// Rotated files kept beside the current one.
const KEEP_FILES: usize = 5;

/// The log target of this crate's own records.
const APP_TARGET: &str = env!("CARGO_CRATE_NAME");
/// The plugin's target for records sent from the frontend.
const WEBVIEW_TARGET: &str = "webview";

static LOCAL_OFFSET: OnceLock<time::UtcOffset> = OnceLock::new();

/// Reads the machine's UTC offset for the log's timestamps. Must run before
/// any other thread starts: on Linux and macOS the offset can only be read
/// safely while the process has a single thread, which is also why the
/// plugin's own `UseLocal` falls back to UTC once the app is running.
pub fn init_local_offset() {
    LOCAL_OFFSET
        .get_or_init(|| time::UtcOffset::current_local_offset().unwrap_or(time::UtcOffset::UTC));
}

fn local_offset() -> time::UtcOffset {
    LOCAL_OFFSET.get().copied().unwrap_or(time::UtcOffset::UTC)
}

/// The log plugin, writing to the OS log folder (and the terminal in debug
/// builds). Dependencies log at warn and above only; lapin,
/// rustls, russh and the webview stack are chatty at info.
pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    let file_name = Some(FILE_NAME.to_string());
    // A Store install keeps it where the file manager can open it, see `paths`.
    let mut targets = vec![Target::new(match crate::paths::package_state_dir() {
        Some(dir) => TargetKind::Folder {
            path: dir.join("logs"),
            file_name,
        },
        None => TargetKind::LogDir { file_name },
    })];
    if cfg!(debug_assertions) {
        targets.push(Target::new(TargetKind::Stdout));
    }
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .targets(targets)
        .max_file_size(MAX_FILE_SIZE)
        .rotation_strategy(RotationStrategy::KeepSome(KEEP_FILES))
        // Names the rotated files by local time where the OS allows it.
        .timezone_strategy(TimezoneStrategy::UseLocal)
        // After `timezone_strategy`, which replaces the format.
        .format(|out, message, record| {
            out.finish(format_args!(
                "{} {:<5} [{}] {}",
                timestamp(time::OffsetDateTime::now_utc().to_offset(local_offset())),
                record.level(),
                short_target(record.target()),
                message
            ))
        })
        .level(LevelFilter::Warn)
        .level_for(APP_TARGET, LevelFilter::Info)
        .level_for(WEBVIEW_TARGET, LevelFilter::Info)
        .build()
}

/// `2026-10-01 14:03:22.120 -03:00`: the offset is spelled out because it
/// is UTC on machines where the local one couldn't be read.
fn timestamp(now: time::OffsetDateTime) -> String {
    let offset = now.offset();
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}.{:03} {}{:02}:{:02}",
        now.year(),
        u8::from(now.month()),
        now.day(),
        now.hour(),
        now.minute(),
        now.second(),
        now.millisecond(),
        if offset.is_negative() { '-' } else { '+' },
        offset.whole_hours().unsigned_abs(),
        offset.minutes_past_hour().unsigned_abs(),
    )
}

/// Drops this crate's name from its own targets, and the caller location
/// the frontend's records carry in theirs (`webview::fn@url:line:col`).
fn short_target(target: &str) -> &str {
    if target.starts_with(WEBVIEW_TARGET) {
        return WEBVIEW_TARGET;
    }
    match target.strip_prefix(APP_TARGET) {
        Some("") => "app",
        Some(rest) => rest.strip_prefix("::").unwrap_or(rest),
        None => target,
    }
}

/// The folder the log file is written to, matching `plugin`'s target.
pub fn log_dir<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<std::path::PathBuf> {
    Ok(crate::paths::shared_dir(app.path().app_log_dir()?, "logs"))
}

/// The first lines of every session: which build, on what, and where its
/// log lives.
pub fn log_startup<R: Runtime, M: Manager<R>>(app: &M) {
    let log_dir = log_dir(app)
        .map(|p| p.display().to_string())
        .unwrap_or_else(|e| format!("unknown ({e})"));
    log::info!(
        "Rabbit Studio {} starting on {} {} ({} build); logs in {log_dir}",
        app.package_info().version,
        std::env::consts::OS,
        std::env::consts::ARCH,
        if cfg!(debug_assertions) {
            "debug"
        } else {
            "release"
        },
    );
}

/// Logs panics before the default hook prints them. Release builds abort on
/// panic, so this line is often the only trace a crash leaves.
pub fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let message = info
            .payload_as_str()
            .unwrap_or("panic payload is not a string");
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "an unknown location".to_string());
        let thread = std::thread::current();
        let thread = thread.name().unwrap_or("unnamed");
        // Captured only when RUST_BACKTRACE asks for it, so a panic costs
        // nothing extra by default (release builds are stripped anyway).
        let backtrace = std::backtrace::Backtrace::capture();
        let backtrace = match backtrace.status() {
            std::backtrace::BacktraceStatus::Captured => format!("\n{backtrace}"),
            _ => String::new(),
        };
        log::error!("panic in thread '{thread}' at {location}: {message}{backtrace}");
        log::logger().flush();
        default_hook(info);
    }));
}

/// Where a connection points, for log lines: scheme and hosts only. The
/// user, password and query string are all dropped.
pub fn host_summary(profile: &ConnectionProfile) -> String {
    match &profile.source {
        ConnectionSource::Manual { host, port } => {
            let scheme = if profile.tls.enabled { "https" } else { "http" };
            format!("{scheme}://{host}:{port}")
        }
        ConnectionSource::Uri { uri } => uri_hosts(uri),
    }
}

/// The hosts, and the SSH server in front of them if a tunnel is on: a
/// tunnel is the first suspect when a connection fails.
pub fn route(profile: &ConnectionProfile) -> String {
    let hosts = host_summary(profile);
    match profile.ssh_tunnel.as_ref().filter(|ssh| ssh.enabled) {
        Some(ssh) => format!("{hosts} via SSH tunnel {}:{}", ssh.host, ssh.port),
        None => hosts,
    }
}

fn uri_hosts(uri: &str) -> String {
    const UNPARSEABLE: &str = "an unparseable connection string";
    let Some((scheme, rest)) = uri.split_once("://") else {
        return UNPARSEABLE.to_string();
    };
    // Split the way the driver does - query first, then the last '@' - so
    // a password with an unescaped '/' or '@' doesn't end the user info
    // early.
    let before_query = rest.split('?').next().unwrap_or_default();
    let hosts = match before_query.rfind('@') {
        Some(at) => &before_query[at + 1..],
        None => before_query,
    };
    let hosts = hosts.split('/').next().unwrap_or_default();
    // What's left must look like hosts; anything else (`user:pa` from a
    // password with an unescaped '?') is user info and stays out.
    if hosts.split(',').all(looks_like_host) {
        format!("{scheme}://{hosts}")
    } else {
        UNPARSEABLE.to_string()
    }
}

/// `name`, `name:port` or `[ipv6]:port`, the port all digits.
fn looks_like_host(host: &str) -> bool {
    let (name, port) = match host.strip_prefix('[') {
        Some(v6) => match v6.split_once(']') {
            Some((addr, rest)) => (addr, rest.strip_prefix(':')),
            None => return false,
        },
        None => match host.split_once(':') {
            Some((name, port)) => (name, Some(port)),
            None => (host, None),
        },
    };
    let port_ok = port.is_none_or(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()));
    let name_ok = !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '%' | ':'));
    port_ok && name_ok
}

/// Masks the user info of any URL in `text`, for messages that come from
/// elsewhere (driver, ssh, OS) and could quote a connection string.
pub fn scrub_credentials(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(idx) = rest.find("://") {
        let authority_start = idx + 3;
        out.push_str(&rest[..authority_start]);
        rest = &rest[authority_start..];
        // The URL runs to the next whitespace or quote; its user info ends
        // at the last '@' before the path or query.
        let url_end = rest
            .find(|c: char| c.is_whitespace() || matches!(c, '"' | '\'' | '`' | '<' | '>'))
            .unwrap_or(rest.len());
        let url = &rest[..url_end];
        let authority = url.split('?').next().unwrap_or_default();
        if let Some(at) = authority.rfind('@') {
            out.push_str("***@");
            rest = &rest[at + 1..];
        }
    }
    out.push_str(rest);
    out
}

/// How much of an error a log line may repeat.
#[derive(Clone, Copy)]
pub enum Detail {
    /// The whole message (scrubbed of credentials).
    Full,
}

/// The log line's version of an error.
pub fn describe(err: &AppError, detail: Detail) -> String {
    let Detail::Full = detail;
    scrub_credentials(&err.to_string())
}

/// Errors the user can fix (a typo, a server that's down) are warnings;
/// failures of the machine itself (disk, keychain) are errors.
fn level_of(err: &AppError) -> Level {
    match err {
        AppError::Io(_) | AppError::Secret(_) => Level::Error,
        _ => Level::Warn,
    }
}

/// Logs a command's error, if it failed, and hands the result back.
pub fn logged<T>(command: &str, result: AppResult<T>) -> AppResult<T> {
    if let Err(e) = &result {
        log::log!(
            level_of(e),
            "{command} failed: {}",
            describe(e, Detail::Full)
        );
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ConnectionAdvancedOptions, TlsOptions};

    fn profile(source: ConnectionSource) -> ConnectionProfile {
        ConnectionProfile {
            id: "id".to_string(),
            name: "prod".to_string(),
            color: None,
            source,
            environment: Default::default(),
            username: None,
            has_password: false,
            tls: TlsOptions::default(),
            amqp: Default::default(),
            ssh_tunnel: None,
            advanced: ConnectionAdvancedOptions::default(),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn uri(uri: &str) -> String {
        host_summary(&profile(ConnectionSource::Uri {
            uri: uri.to_string(),
        }))
    }

    #[test]
    fn host_summary_keeps_only_scheme_and_hosts() {
        assert_eq!(
            uri("https://alice:s3cret@mq1:15671/rabbit?x=1"),
            "https://mq1:15671"
        );
        assert_eq!(uri("http://localhost:15672"), "http://localhost:15672");
        assert_eq!(
            host_summary(&profile(ConnectionSource::Manual {
                host: "mq.internal".to_string(),
                port: 15672,
            })),
            "http://mq.internal:15672"
        );
    }

    #[test]
    fn host_summary_never_contains_a_secret() {
        for (text, secret) in [
            ("http://alice:s3cret@db:5432/", "s3cret"),
            // unescaped characters a hand-written string might carry
            ("http://alice:p@zz/w0rd@db:5432/", "w0rd"),
            ("http://alice:p@zz/w0rd@db:5432/", "zz"),
            ("http://alice:qx?zz@db:5432/", "qx"),
            ("http://alice:qx?zz@db:5432/", "zz"),
            ("http://db/shop?password=s3cret", "s3cret"),
            ("host=db user=alice password=s3cret", "s3cret"),
        ] {
            let summary = uri(text);
            assert!(!summary.contains(secret), "{text} -> {summary}");
            assert!(!summary.contains("alice"), "{text} -> {summary}");
        }
    }

    #[test]
    fn scrubbing_masks_user_info_in_free_text() {
        assert_eq!(
            scrub_credentials("failed to reach http://bob:hunter2@db:5432/x?y=1 (timeout)"),
            "failed to reach http://***@db:5432/x?y=1 (timeout)"
        );
        assert_eq!(
            scrub_credentials("\"http://bob:p@ss@c.example.net\" and ssh://me@jump"),
            "\"http://***@c.example.net\" and ssh://***@jump"
        );
        let plain = "connection refused";
        assert_eq!(scrub_credentials(plain), plain);
    }

    #[test]
    fn described_errors_are_scrubbed() {
        let err = AppError::InvalidInput(
            "invalid connection string: http://bob:hunter2@db:5432".to_string(),
        );
        assert!(!describe(&err, Detail::Full).contains("hunter2"));
    }

    #[test]
    fn targets_are_shortened() {
        assert_eq!(short_target(APP_TARGET), "app");
        assert_eq!(short_target(&format!("{APP_TARGET}::commands")), "commands");
        assert_eq!(
            short_target("webview::onError@http://x/a.js:1:2"),
            "webview"
        );
        assert_eq!(
            short_target("lapin::channel"),
            "lapin::channel"
        );
    }

    #[test]
    fn timestamps_spell_out_the_offset() {
        let at = time::OffsetDateTime::from_unix_timestamp(0)
            .unwrap()
            .to_offset(time::UtcOffset::from_hms(-3, -30, 0).unwrap());
        assert_eq!(timestamp(at), "1969-12-31 20:30:00.000 -03:30");
    }
}
