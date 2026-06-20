use std::path::PathBuf;
use std::sync::Mutex;

use base64::Engine;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[cfg(not(debug_assertions))]
use tauri::path::BaseDirectory;
#[cfg(not(debug_assertions))]
use std::net::{SocketAddr, TcpListener, TcpStream};
#[cfg(not(debug_assertions))]
use std::time::Duration;
#[cfg(not(debug_assertions))]
use tauri::RunEvent;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

/// Holds the active folder watcher so it stays alive across command calls.
struct WatchState(Mutex<Option<RecommendedWatcher>>);

/// Holds the bundled Next.js server process so we can kill it on exit instead of
/// leaking an orphaned `node` (and the port it holds) after the window closes.
#[cfg(not(debug_assertions))]
struct ServerProcess(Mutex<Option<CommandChild>>);

#[derive(Serialize)]
struct FileData {
    name: String,
    data: String, // base64
}

/// Open a native folder picker, returning the chosen path (or None).
///
/// This is `async` on purpose: sync commands run on the main thread, and
/// `blocking_pick_folder()` would then block the very event loop the native
/// dialog needs to run, deadlocking (and surfacing in the webview as a rejected
/// invoke). Instead we drive the dialog through the non-blocking callback API —
/// which always marshals onto the main loop — and await the result on this
/// worker thread via a channel.
#[tauri::command]
async fn pick_folder(app: tauri::AppHandle) -> Option<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |folder| {
        // Send may fail only if the receiver was dropped (command aborted);
        // ignore — there is nothing left to return the path to.
        let _ = tx.send(folder);
    });
    rx.recv()
        .ok()
        .flatten()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
}

/// Read a file and return its name + base64 contents (the webview rebuilds a
/// File and POSTs it to /api/documents).
#[tauri::command]
fn read_file(path: String) -> Result<FileData, String> {
    // Cap the size: the whole file is read into memory, base64-encoded (~33%
    // inflation), then copied again as JSON over IPC, so a multi-GB input could
    // exhaust memory and abort the process. Return an error instead of slurping.
    const MAX_BYTES: u64 = 64 * 1024 * 1024; // 64 MB
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > MAX_BYTES {
        return Err(format!(
            "ファイルが大きすぎます ({} バイト, 上限 {} バイト)",
            meta.len(),
            MAX_BYTES
        ));
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let name = PathBuf::from(&path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file")
        .to_string();
    let data = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(FileData { name, data })
}

/// Poll a file's size until it stops growing (or a ~10s timeout), so a file
/// still being written — a slow copy from network/USB, or an in-place write —
/// isn't read mid-write and ingested truncated. Returns false if it vanished.
fn wait_until_stable(path: &std::path::Path) -> bool {
    let mut last = match std::fs::metadata(path) {
        Ok(m) => m.len(),
        Err(_) => return false,
    };
    for _ in 0..40 {
        std::thread::sleep(std::time::Duration::from_millis(250));
        let cur = match std::fs::metadata(path) {
            Ok(m) => m.len(),
            Err(_) => return false,
        };
        if cur == last {
            return true;
        }
        last = cur;
    }
    true
}

/// Start watching a folder; emits "kura://file-detected" with the path once a
/// new/changed file has settled.
#[tauri::command]
fn start_watch(
    app: tauri::AppHandle,
    state: State<WatchState>,
    path: String,
) -> Result<(), String> {
    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(
        move |res: notify::Result<notify::Event>| {
            if let Ok(event) = res {
                if matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                    for p in event.paths {
                        if p.is_file() {
                            // Settle off this callback thread, then emit once, so
                            // an in-progress write isn't read mid-copy. Trailing
                            // events for the same completed file are deduped on
                            // the JS side (recently-ingested window).
                            let handle = handle.clone();
                            std::thread::spawn(move || {
                                if wait_until_stable(&p) {
                                    let _ = handle.emit(
                                        "kura://file-detected",
                                        p.to_string_lossy().to_string(),
                                    );
                                }
                            });
                        }
                    }
                }
            }
        },
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(std::path::Path::new(&path), RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    *state.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(watcher);
    Ok(())
}

/// Stop watching (drops the watcher).
#[tauri::command]
fn stop_watch(state: State<WatchState>) {
    // Poison-tolerant: a panic elsewhere holding this lock must not turn a
    // simple "stop watching" into a panic with no error channel.
    *state.0.lock().unwrap_or_else(|e| e.into_inner()) = None;
}

/// Ask the OS for a free TCP port by binding to :0 and reading back the
/// assignment. There is a tiny race between dropping the listener here and the
/// Node server claiming it, but it is effectively never hit on a desktop and is
/// far safer than hardcoding 3000 (the classic "connection denied" cause).
#[cfg(not(debug_assertions))]
fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(34117)
}

/// Block until something is listening on the port (the server has booted), or
/// give up after ~30s. Returns whether the server came up.
#[cfg(not(debug_assertions))]
fn wait_for_server(port: u16) -> bool {
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    for _ in 0..300 {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    false
}

/// Launch the bundled Next.js standalone server as a hidden `node` sidecar and,
/// once it is listening, point the main window at it. Production only — in dev,
/// `beforeDevCommand` already runs `next dev` and the window uses `devUrl`.
#[cfg(not(debug_assertions))]
fn start_server(app: &tauri::App) {
    let handle = app.handle().clone();

    // resources/app-server (server.js + traced node_modules + .next + public),
    // bundled via tauri.conf.json `resources`. resolve() keeps the relative path
    // the bundler used, so we don't have to guess the on-disk layout.
    let server_dir = match app
        .path()
        .resolve("resources/app-server", BaseDirectory::Resource)
    {
        Ok(dir) => dir,
        Err(e) => {
            eprintln!("[kura] cannot resolve bundled server: {e}");
            return;
        }
    };
    let server_js = server_dir.join("server.js");
    let port = free_port();

    let sidecar = match app.shell().sidecar("node") {
        Ok(cmd) => cmd,
        Err(e) => {
            eprintln!("[kura] node sidecar missing: {e}");
            return;
        }
    };

    let spawned = sidecar
        .current_dir(server_dir.clone())
        .env("PORT", port.to_string())
        // Bind loopback only — the server is for this app, not the LAN.
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .args([server_js.to_string_lossy().to_string()])
        .spawn();

    let (mut rx, child) = match spawned {
        Ok(pair) => pair,
        Err(e) => {
            eprintln!("[kura] failed to start server: {e}");
            return;
        }
    };

    // Keep the child so we can kill it on exit (see RunEvent::Exit below).
    if let Some(state) = handle.try_state::<ServerProcess>() {
        *state.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(child);
    }

    // Drain the server's stdout/stderr so its OS pipe buffer never fills and
    // blocks the Node process during a long session. Log the lines (instead of
    // silently discarding) so a sidecar boot failure — e.g. a better-sqlite3
    // NODE_MODULE_VERSION mismatch — leaves a diagnostic trail.
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                    eprintln!("[kura sidecar] {}", String::from_utf8_lossy(&line));
                }
                _ => {}
            }
        }
    });

    // Wait for readiness off the main thread, then navigate the window.
    std::thread::spawn(move || {
        if wait_for_server(port) {
            if let Some(win) = handle.get_webview_window("main") {
                match format!("http://127.0.0.1:{port}").parse() {
                    Ok(url) => {
                        let _ = win.navigate(url);
                    }
                    Err(e) => eprintln!("[kura] bad server url: {e}"),
                }
            }
        } else {
            // The sidecar never started listening (boot crash, ABI mismatch,
            // port stolen, …). Without this the window sits on the loading
            // spinner forever with no user-visible explanation.
            eprintln!("[kura] server did not come up on port {port}");
            handle
                .dialog()
                .message(
                    "内部サーバーの起動に失敗しました。アプリを再起動してください。問題が続く場合は再インストールをお試しください。",
                )
                .title("Kura 起動エラー")
                .blocking_show();
        }
    });
}

/// On launch (release only) check GitHub Releases for a newer signed build. If one
/// exists, ask the user; on accept, download + install it and relaunch. Runs in the
/// background so it never blocks startup. Compiled out in debug (no signed artifacts).
#[cfg(not(debug_assertions))]
fn check_for_updates(handle: tauri::AppHandle) {
    use tauri_plugin_dialog::MessageDialogButtons;
    use tauri_plugin_updater::UpdaterExt;

    tauri::async_runtime::spawn(async move {
        let updater = match handle.updater() {
            Ok(u) => u,
            Err(e) => {
                eprintln!("[kura] updater unavailable: {e}");
                return;
            }
        };

        match updater.check().await {
            Ok(Some(update)) => {
                let accepted = handle
                    .dialog()
                    .message(format!(
                        "新しいバージョン {} が利用可能です。今すぐ更新しますか?",
                        update.version
                    ))
                    .title("Kura のアップデート")
                    .buttons(MessageDialogButtons::OkCancel)
                    .blocking_show();

                if accepted {
                    match update.download_and_install(|_, _| {}, || {}).await {
                        Ok(_) => handle.restart(),
                        Err(e) => eprintln!("[kura] update install failed: {e}"),
                    }
                }
            }
            Ok(None) => {} // already up to date
            Err(e) => eprintln!("[kura] update check failed: {e}"),
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(WatchState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            pick_folder,
            read_file,
            start_watch,
            stop_watch
        ]);

    #[cfg(not(debug_assertions))]
    let builder = builder
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            start_server(app);
            check_for_updates(app.handle().clone());
            Ok(())
        });

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building Kura");

    app.run(|_app_handle, _event| {
        // Reap the bundled server on shutdown so it doesn't outlive the window.
        #[cfg(not(debug_assertions))]
        if let RunEvent::Exit = _event {
            if let Some(state) = _app_handle.try_state::<ServerProcess>() {
                if let Some(child) = state.0.lock().unwrap_or_else(|e| e.into_inner()).take() {
                    let _ = child.kill();
                }
            }
        }
    });
}
