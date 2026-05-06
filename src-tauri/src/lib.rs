// Cosmos Corp — Tauri backend entry point.
//
// This file wires up the IPC commands declared in `src/ipc/contract.ts`.
// Stream A (Rust backend) is responsible for filling in the bodies — the
// stubs here exist so the frontend can call them and the project compiles.

use serde::{Deserialize, Serialize};

mod commands;

#[derive(Serialize, Deserialize)]
struct DockerHealth {
    ok: bool,
    reason: Option<String>,
}

#[tauri::command]
async fn docker_health() -> Result<DockerHealth, String> {
    // TODO(stream-a): exec `docker version` and parse the result.
    Ok(DockerHealth {
        ok: false,
        reason: Some("not yet implemented".into()),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            docker_health,
            commands::ping::ping,
        ])
        .run(tauri::generate_context!())
        .expect("error while running cosmos-corp");
}
