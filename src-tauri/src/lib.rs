mod commands;
mod connection;
mod connections_io;
mod error;
mod logging;
mod models;
mod paths;
mod rmq;
mod secrets;
mod sidebar_layout;
mod ssh_tunnel;
mod state;
mod window_size;

use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

use sidebar_layout::SidebarLayoutStore;
use state::AppState;

#[cfg(feature = "devbridge")]
pub mod devbridge;

/// The commands the frontend can call.
fn with_commands<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        commands::list_connection_profiles,
        commands::get_connection_profile,
        commands::save_connection_profile,
        commands::delete_connection_profile,
        commands::test_connection,
        commands::connect,
        commands::disconnect,
        commands::secret_backend_info,
        commands::mgmt,
        commands::get_messages,
        commands::transfer_messages,
        commands::read_stream,
        commands::cancel_task,
        commands::export_definitions,
        commands::import_definitions,
        commands::read_text_file,
        commands::write_text_file,
        commands::export_connections,
        commands::import_connections,
        commands::preview_connections_import,
        commands::get_sidebar_layout,
        commands::save_sidebar_layout,
        commands::open_log_dir,
        window_size::remember_window_size,
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // First, while this is still the only thread.
    logging::init_local_offset();
    logging::install_panic_hook();

    with_commands(tauri::Builder::default())
        // First, so what the other plugins log is caught too.
        .plugin(logging::plugin())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // Size, position and maximized state come back from the last run.
        // Not visibility: the window starts hidden and the page shows it once
        // it has painted, so it never opens on a blank white frame.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(window_state_flags())
                .build(),
        )
        .setup(|app| {
            logging::log_startup(app);
            setup(app).inspect_err(|e| log::error!("startup failed: {e}"))
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_, event| {
            // Tells a clean quit apart from a crash, which ends the log
            // without this line.
            if let tauri::RunEvent::Exit = event {
                log::info!("Rabbit Studio exiting");
            }
        });
}

fn setup<R: tauri::Runtime>(app: &mut tauri::App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let config_dir = app.path().app_config_dir()?;
    if let Some(window) = app.get_webview_window("main") {
        window_size::restore(&window, &config_dir);
    }
    // The page shows the window as soon as it paints. Should it never get
    // there (a broken bundle, a hung webview), show it anyway.
    if let Some(window) = app.get_webview_window("main") {
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(4));
            if !window.is_visible().unwrap_or(true) {
                log::warn!("the page didn't show the window in time; showing it");
                let _ = window.show();
            }
        });
    }
    // Saved on close by the plugin, and also once a move or resize settles,
    // so a crash or a killed process doesn't lose the window's last place.
    if let Some(window) = app.get_webview_window("main") {
        use std::sync::atomic::{AtomicU64, Ordering};
        use tauri_plugin_window_state::AppHandleExt;
        let handle = app.handle().clone();
        let latest = std::sync::Arc::new(AtomicU64::new(0));
        window.on_window_event(move |event| {
            if matches!(
                event,
                tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_)
            ) {
                let mine = latest.fetch_add(1, Ordering::SeqCst) + 1;
                let latest = latest.clone();
                let handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(600)).await;
                    if latest.load(Ordering::SeqCst) == mine {
                        if let Err(e) = handle.save_window_state(window_state_flags()) {
                            log::warn!("couldn't save the window's place: {e}");
                        }
                    }
                });
            }
        });
    }
    #[cfg(any(debug_assertions, feature = "smoke"))]
    smoke(app);
    let state =
        AppState::init(&config_dir).map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
    app.manage(state);
    let layout = SidebarLayoutStore::load(&config_dir)
        .map_err(|e| -> Box<dyn std::error::Error> { e.to_string().into() })?;
    app.manage(layout);
    Ok(())
}

/// Debug builds (or `--features smoke`): with `RABBIT_STUDIO_SMOKE=<file>`, runs `smoke.js` in the
/// window once it has loaded - the real IPC, end to end - and the script
/// writes what it saw to `<file>`.
#[cfg(any(debug_assertions, feature = "smoke"))]
fn smoke<R: tauri::Runtime>(app: &tauri::App<R>) {
    let Ok(out) = std::env::var("RABBIT_STUDIO_SMOKE") else {
        return;
    };
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let mode = std::env::var("RABBIT_STUDIO_SMOKE_MODE").unwrap_or_else(|_| "ipc".into());
    let js = include_str!("smoke.js")
        .replace("__OUT__", &out.replace('\\', "\\\\"))
        .replace("__MODE__", &mode);
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(4));
        let _ = window.eval(&js);
    });
}

/// What the plugin keeps between runs: not visibility (the window starts
/// hidden and the page shows it) and not the size (window_size.rs).
fn window_state_flags() -> StateFlags {
    StateFlags::all() - StateFlags::VISIBLE - StateFlags::SIZE
}
