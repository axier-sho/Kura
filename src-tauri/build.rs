fn main() {
    // The webview loads from a remote origin (the bundled Next.js server on
    // http://localhost:*), and Tauri 2 only auto-grants the app's own commands
    // to LOCAL (tauri://) windows. Remote origins must be granted each command
    // explicitly via the ACL. Registering them here generates an `allow-<cmd>`
    // permission for each, which capabilities/default.json then lists for the
    // remote window — without this the webview's invoke() fails with
    // "Command <name> not allowed by ACL".
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "pick_folder",
                "read_file",
                "start_watch",
                "stop_watch",
            ]),
        ),
    )
    .expect("failed to run tauri-build");
}
