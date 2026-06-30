// PTY bridge for xterm.js.
//
// One global PTY session at a time - the player only sees one terminal at
// once, and missions chain through the same chapter container. The session
// owns:
//   * a `MasterPty` so we can resize on xterm fit-addon events,
//   * a writer for keystrokes from the frontend,
//   * a child handle so we can kill it on `reset_chapter` / mission swap,
// and spawns a blocking reader thread that pumps bytes onto the
// `pty:data` Tauri event channel (matches `src/ipc/contract.ts`).

use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use anyhow::{anyhow, Result};
use once_cell::sync::Lazy;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tracing::{debug, info, warn};

/// JSON-serialisable payload for the `pty:data` event. The TS contract
/// declares `bytes: number[]` - `Vec<u8>` serialises as a JSON array of
/// numbers, which is exactly that.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PtyDataPayload {
    bytes: Vec<u8>,
}

struct PtySession {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    /// Human-readable label used in logs and to detect stale cleanup races.
    description: String,
}

static SESSION: Lazy<Mutex<Option<Arc<PtySession>>>> = Lazy::new(|| Mutex::new(None));

/// Default initial size; xterm.js will resize once the FitAddon measures.
const DEFAULT_SIZE: PtySize = PtySize {
    rows: 30,
    cols: 100,
    pixel_width: 0,
    pixel_height: 0,
};

/// Close the current PTY session if any. Idempotent.
pub fn close_session() {
    let taken = {
        let mut guard = match SESSION.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        guard.take()
    };
    if let Some(session) = taken {
        info!(target: "pty", description = %session.description, "closing pty session");
        if let Ok(mut child) = session.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Spawn a new PTY running `program args...` and start the reader thread.
/// Replaces any existing session.
pub fn open_pty(
    app: &AppHandle,
    program: &str,
    args: &[&str],
    description: impl Into<String>,
    initial_size: PtySize,
) -> Result<()> {
    close_session();

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(initial_size)
        .map_err(|e| anyhow!("openpty failed: {e}"))?;

    let mut cmd = CommandBuilder::new(program);
    for arg in args {
        cmd.arg(arg);
    }
    cmd.env("TERM", "xterm-256color");
    // portable-pty inherits cwd from the parent; for `docker exec` that's fine,
    // for host bash it gives the user a familiar starting point.

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| anyhow!("spawn_command failed: {e}"))?;
    // Drop the slave handle so the reader sees EOF if the child exits.
    drop(pair.slave);

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| anyhow!("take_writer failed: {e}"))?;
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| anyhow!("try_clone_reader failed: {e}"))?;

    let description = description.into();
    let session = Arc::new(PtySession {
        master: Mutex::new(pair.master),
        writer: Mutex::new(writer),
        child: Mutex::new(child),
        description: description.clone(),
    });

    {
        let mut guard = SESSION.lock().expect("SESSION mutex poisoned");
        *guard = Some(session);
    }

    spawn_reader_thread(app.clone(), reader, description);
    Ok(())
}

/// Convenience helper for the M0 smoke test - host bash, no Docker required.
pub fn open_host_bash(app: &AppHandle) -> Result<()> {
    open_pty(app, "bash", &["-l"], "host-bash", DEFAULT_SIZE)
}

/// Open a PTY into `docker exec -it [-u <user>] <container_id> bash -l`.
/// Used by the mission orchestrator once the chapter container is up. Pass
/// `Some("dev")` for chapters whose image runs as root by default but whose
/// player workflow lives under `/home/dev` (the k8s/flux labs - k3s needs
/// root as PID 1, but kubeconfig + bash history live in dev's home).
pub fn open_container_pty(
    app: &AppHandle,
    container_id: &str,
    user: Option<&str>,
) -> Result<()> {
    let description = format!("docker:{container_id}");
    let mut args: Vec<&str> = vec!["exec", "-it"];
    if let Some(u) = user {
        args.push("-u");
        args.push(u);
    }
    args.extend(["--", container_id, "bash", "-l"]);
    open_pty(app, "docker", &args, description, DEFAULT_SIZE)
}

fn spawn_reader_thread(app: AppHandle, mut reader: Box<dyn Read + Send>, description: String) {
    let thread_name = format!("pty-reader[{description}]");
    std::thread::Builder::new()
        .name(thread_name)
        .spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        info!(target: "pty", description = %description, "reader EOF");
                        break;
                    }
                    Ok(n) => {
                        let payload = PtyDataPayload {
                            bytes: buf[..n].to_vec(),
                        };
                        if let Err(e) = app.emit("pty:data", payload) {
                            warn!(target: "pty", error = %e, "emit pty:data failed");
                            break;
                        }
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(e) => {
                        warn!(target: "pty", error = %e, "reader error");
                        break;
                    }
                }
            }
            // Drop the session if it's still the one we belong to. A newer
            // `open_pty` may have already replaced it - leave that one alone.
            let mut guard = match SESSION.lock() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            let stale = guard
                .as_ref()
                .map(|s| s.description == description)
                .unwrap_or(false);
            if stale {
                debug!(target: "pty", description = %description, "clearing stale session after reader exit");
                *guard = None;
            }
        })
        .expect("failed to spawn pty reader thread");
}

fn current_session() -> Result<Arc<PtySession>, String> {
    let guard = SESSION.lock().map_err(|e| e.to_string())?;
    guard
        .clone()
        .ok_or_else(|| "no PTY session is open".to_string())
}

// ─────────────────────────────────────────────────────────────────────────
// Tauri commands
// ─────────────────────────────────────────────────────────────────────────

/// `write_pty({ bytes }: { bytes: number[] })` - keystrokes from xterm.js.
#[tauri::command]
pub async fn write_pty(bytes: Vec<u8>) -> Result<(), String> {
    let session = current_session()?;
    let mut writer = session.writer.lock().map_err(|e| e.to_string())?;
    writer.write_all(&bytes).map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// `resize_pty({ cols, rows }: { cols: number; rows: number })` - winsize.
///
/// Intentionally tolerant of "no session yet": xterm.js fires an initial
/// resize on mount, which can land before `start_mission` / a debug
/// `open_*_pty` finishes. Silently no-op in that case so the UI doesn't
/// have to special-case the race.
#[tauri::command]
pub async fn resize_pty(cols: u16, rows: u16) -> Result<(), String> {
    let session = match current_session() {
        Ok(s) => s,
        Err(_) => {
            debug!(target: "pty", cols, rows, "resize before pty open - ignored");
            return Ok(());
        }
    };
    let master = session.master.lock().map_err(|e| e.to_string())?;
    master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("resize: {e}"))?;
    debug!(target: "pty", cols, rows, "resized");
    Ok(())
}

/// M0 smoke-test command: spawn a host `bash` PTY so the Terminal component
/// can be wired up before Docker is involved. Not part of the contract;
/// safe to keep around as a fallback / debug entry point.
#[tauri::command]
pub async fn open_host_bash_pty(app: AppHandle) -> Result<(), String> {
    open_host_bash(&app).map_err(|e| e.to_string())
}
