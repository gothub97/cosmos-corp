// Mission validator.
//
// While a mission is active, this tokio task ticks every 2s:
//   1. Runs the mission's `check.sh` (which `touch`es marker files
//      under /tmp/.cosmos/<objective_id> when an objective passes).
//   2. For each not-yet-complete objective, runs `test -f <marker>` and,
//      if the marker is present, emits `objective:completed`.
//   3. When all objectives are green, emits `mission:completed` and stops.
//
// The mission orchestrator (commands/mission.rs) owns the `ValidatorHandle`
// and calls `.stop().await` on mission change / reset_chapter.

use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use bollard::Docker;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::Notify;
use tokio::task::JoinHandle;
use tracing::{debug, info, warn};

use crate::commands::docker::exec_bash;
use crate::commands::mission::MISSION_SCRIPTS_DIR;

const POLL_INTERVAL: Duration = Duration::from_secs(2);

/// One objective the validator should watch.
#[derive(Debug, Clone)]
pub struct ObjectiveSpec {
    pub id: String,
}

#[derive(Debug, Clone, Serialize)]
struct ObjectiveCompletedPayload {
    #[serde(rename = "objectiveId")]
    objective_id: String,
}

#[derive(Debug, Clone, Serialize)]
struct MissionCompletedPayload {
    key: String,
}

#[derive(Debug, Clone, Serialize)]
struct ValidatorErrorPayload {
    message: String,
}

/// Handle returned from `start_validator`. Drop it without calling `.stop()`
/// and the loop keeps running - always stop explicitly on mission change.
pub struct ValidatorHandle {
    stop: Arc<Notify>,
    join: JoinHandle<()>,
    pub mission_key: String,
}

impl ValidatorHandle {
    /// Signal the loop to stop and wait for it (with a 5s safety timeout).
    pub async fn stop(self) {
        self.stop.notify_waiters();
        match tokio::time::timeout(Duration::from_secs(5), self.join).await {
            Ok(_) => {}
            Err(_) => warn!(
                target: "validator",
                mission = %self.mission_key,
                "validator did not stop within 5s - abandoning"
            ),
        }
    }
}

/// Spawn a validator for `mission_key` against `container_id`. Returns
/// immediately; emits events on `app`.
pub fn start_validator(
    app: AppHandle,
    docker: Docker,
    container_id: String,
    mission_key: String,
    objectives: Vec<ObjectiveSpec>,
) -> ValidatorHandle {
    let stop = Arc::new(Notify::new());
    let stop_for_task = stop.clone();
    let mission_for_task = mission_key.clone();
    let join = tokio::spawn(async move {
        run_loop(
            app,
            docker,
            container_id,
            mission_for_task,
            objectives,
            stop_for_task,
        )
        .await;
    });
    ValidatorHandle {
        stop,
        join,
        mission_key,
    }
}

async fn run_loop(
    app: AppHandle,
    docker: Docker,
    container_id: String,
    mission_key: String,
    objectives: Vec<ObjectiveSpec>,
    stop: Arc<Notify>,
) {
    info!(
        target: "validator",
        mission = %mission_key,
        objectives = objectives.len(),
        "starting"
    );

    let mut completed = vec![false; objectives.len()];
    let mut ticker = tokio::time::interval(POLL_INTERVAL);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    // First `tick()` resolves immediately - that's fine, we want a fast probe.

    let stop_fut = stop.notified();
    tokio::pin!(stop_fut);

    loop {
        tokio::select! {
            biased;
            _ = &mut stop_fut => {
                info!(target: "validator", mission = %mission_key, "stop requested");
                break;
            }
            _ = ticker.tick() => {
                if let Err(e) = run_tick(&app, &docker, &container_id, &objectives, &mut completed).await {
                    warn!(target: "validator", error = %e, "tick failed");
                    let _ = app.emit(
                        "validator:error",
                        ValidatorErrorPayload { message: format!("{e:#}") },
                    );
                }
                if !completed.is_empty() && completed.iter().all(|&c| c) {
                    info!(target: "validator", mission = %mission_key, "all objectives complete");
                    let _ = app.emit(
                        "mission:completed",
                        MissionCompletedPayload { key: mission_key.clone() },
                    );
                    break;
                }
            }
        }
    }

    info!(target: "validator", mission = %mission_key, "stopped");
}

async fn run_tick(
    app: &AppHandle,
    docker: &Docker,
    container_id: &str,
    objectives: &[ObjectiveSpec],
    completed: &mut [bool],
) -> Result<()> {
    // 1. Run check.sh if it exists. We `exit 0` afterwards so a non-zero
    // result from the script doesn't poison our exec call - markers carry
    // the truth, the script's exit code is advisory.
    let script = format!(
        "[ -x {dir}/check.sh ] && {dir}/check.sh; exit 0",
        dir = MISSION_SCRIPTS_DIR
    );
    match exec_bash(docker, container_id, &script).await {
        Ok(out) => {
            if !out.stderr.is_empty() {
                debug!(target: "validator", stderr = %out.stderr.trim(), "check.sh stderr");
            }
        }
        Err(e) => {
            // Container may have been destroyed mid-tick; surface but keep
            // looping - the orchestrator will stop us if needed.
            warn!(target: "validator", error = %e, "exec check.sh failed");
        }
    }

    // 2. test -f each marker.
    for (idx, obj) in objectives.iter().enumerate() {
        if completed[idx] {
            continue;
        }
        let marker = format!("/tmp/.cosmos/{}", obj.id);
        let cmd = format!("test -f {}", shell_single_quote(&marker));
        let out = match exec_bash(docker, container_id, &cmd).await {
            Ok(out) => out,
            Err(e) => {
                debug!(target: "validator", marker = %marker, error = %e, "marker check failed");
                continue;
            }
        };
        if out.ok() {
            info!(target: "validator", objective = %obj.id, "completed");
            completed[idx] = true;
            let _ = app.emit(
                "objective:completed",
                ObjectiveCompletedPayload {
                    objective_id: obj.id.clone(),
                },
            );
        }
    }

    Ok(())
}

/// Single-quote a string for safe interpolation into a `bash -lc` script.
fn shell_single_quote(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('\'');
    for c in s.chars() {
        if c == '\'' {
            // Close, escape, re-open.
            out.push_str("'\\''");
        } else {
            out.push(c);
        }
    }
    out.push('\'');
    out
}

#[cfg(test)]
mod tests {
    use super::shell_single_quote;

    #[test]
    fn quotes_simple_path() {
        assert_eq!(shell_single_quote("/tmp/.cosmos/foo"), "'/tmp/.cosmos/foo'");
    }

    #[test]
    fn escapes_embedded_quote() {
        assert_eq!(shell_single_quote("a'b"), "'a'\\''b'");
    }
}
