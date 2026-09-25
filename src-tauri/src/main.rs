// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Health probe. The UI invokes this via the injected `__TAURI__` global
/// (see ipc-status.js), proving the IPC + build pipeline end to end.
/// In M1 the local OpenAI-compatible HTTP API lands next to this.
#[tauri::command]
fn ping() -> String {
    format!(
        "AMTA Companion v{} — shell online (M0 bootstrap)",
        env!("CARGO_PKG_VERSION")
    )
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![ping])
        .run(tauri::generate_context!())
        .expect("error while running the AMTA Companion application");
}
