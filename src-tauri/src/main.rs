// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Health probe. In M1 the local OpenAI-compatible HTTP API lands next to
/// this; the command already proves the IPC + build pipeline end to end.
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
