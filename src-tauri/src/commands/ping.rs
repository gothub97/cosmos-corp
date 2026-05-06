// Smoke test command used by M0 to verify the React ↔ Rust IPC bridge works.
// Safe to delete once any real command is wired up.

#[tauri::command]
pub fn ping() -> &'static str {
    "pong from cosmos-corp"
}
