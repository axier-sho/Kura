use std::path::PathBuf;
use std::sync::Mutex;

use base64::Engine;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

/// Holds the active folder watcher so it stays alive across command calls.
struct WatchState(Mutex<Option<RecommendedWatcher>>);

#[derive(Serialize)]
struct FileData {
    name: String,
    data: String, // base64
}

/// Open a native folder picker, returning the chosen path (or None).
#[tauri::command]
fn pick_folder(app: tauri::AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
}

/// Read a file and return its name + base64 contents (the webview rebuilds a
/// File and POSTs it to /api/documents).
#[tauri::command]
fn read_file(path: String) -> Result<FileData, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let name = PathBuf::from(&path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file")
        .to_string();
    let data = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(FileData { name, data })
}

/// Start watching a folder; emits "kura://file-detected" with the path on
/// new/changed files.
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
                            let _ = handle.emit(
                                "kura://file-detected",
                                p.to_string_lossy().to_string(),
                            );
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

    *state.0.lock().unwrap() = Some(watcher);
    Ok(())
}

/// Stop watching (drops the watcher).
#[tauri::command]
fn stop_watch(state: State<WatchState>) {
    *state.0.lock().unwrap() = None;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(WatchState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            pick_folder,
            read_file,
            start_watch,
            stop_watch
        ])
        .run(tauri::generate_context!())
        .expect("error while running Kura");
}
