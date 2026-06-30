// Cosmos Corp - Tauri backend entry point.
//
// IPC commands are defined in `src/ipc/contract.ts` (the shared TS source of
// truth). Their Rust counterparts live in `commands/` and are registered
// here. Events are emitted via `tauri::Emitter` from the modules that own
// the underlying state (PTY, validator, docker lifecycle).

mod commands;
mod validator;

use tracing_subscriber::{fmt, prelude::*, EnvFilter};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_tracing();
    harden_path();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(commands::mission::manage_state())
        .manage(commands::cluster::manage_state())
        .invoke_handler(tauri::generate_handler![
            commands::ping::ping,
            // Docker
            commands::docker::docker_health,
            // PTY
            commands::pty::write_pty,
            commands::pty::resize_pty,
            commands::pty::open_host_bash_pty,
            // Mission
            commands::mission::list_content,
            commands::mission::start_mission,
            commands::mission::reveal_hint,
            commands::mission::reset_chapter,
            // Cluster (Chapter 3+)
            commands::cluster::get_cluster_snapshot,
            commands::cluster::describe_resource,
            // Save
            commands::save::save_progress,
            commands::save::load_progress,
        ])
        .run(tauri::generate_context!())
        .expect("error while running cosmos-corp");
}

/// macOS GUI apps launched from Finder/Dock inherit a minimal PATH
/// (`/usr/bin:/bin:/usr/sbin:/sbin`) that omits where Docker Desktop and
/// Homebrew install their CLIs. Without this, the PTY's `docker exec` and any
/// other child process fail with "docker ... was not found in PATH" even though
/// the daemon is reachable. Prepend the common install locations (de-duped,
/// existing entries preserved) so child processes can find them. Launching from
/// a terminal already has a full PATH, so this is a no-op there.
fn harden_path() {
    const EXTRA: &[&str] = &[
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/Applications/Docker.app/Contents/Resources/bin",
    ];
    let current = std::env::var("PATH").unwrap_or_default();
    let mut dirs: Vec<String> = EXTRA.iter().map(|s| s.to_string()).collect();
    for entry in current.split(':').filter(|s| !s.is_empty()) {
        if !dirs.iter().any(|d| d == entry) {
            dirs.push(entry.to_string());
        }
    }
    std::env::set_var("PATH", dirs.join(":"));
}

fn init_tracing() {
    // Default to INFO; override with RUST_LOG, e.g.
    // RUST_LOG=cosmos_corp_lib=debug,validator=debug,pty=debug,mission=debug
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,cosmos_corp_lib=debug"));
    let _ = tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().with_target(true).with_level(true))
        .try_init();
}
