// Save / load progress.
//
// Persists `SaveState` (matching `src/ipc/contract.ts`) as JSON to
// `~/Library/Application Support/<bundle-id>/save.json`. We rely on Tauri's
// `path()` API rather than hard-coding the path so it does the right thing
// on every supported platform.
//
// Schema versioning:
//   v1 - initial shape (currentMission, completedMissions, hintsByObjective, lastPlayedAt)
//   v2 - adds `taughtCommands: string[]` for lesson-skip tracking
//   v3 - adds `coursesRead: string[]` for "course already read" tracking
//   v4 - adds `profile` (firstName/lastName/role/employeeId/onboardedAt) for onboarding
//
// On load, an older file is migrated in place: missing fields default via
// serde (`taughtCommands` / `coursesRead` → `[]`, `profile` → blank), the version
// field is bumped, and the file is rewritten.

use std::collections::HashMap;
use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tracing::{debug, info};

const SAVE_FILE: &str = "save.json";
const CURRENT_VERSION: u32 = 4;

/// The player's identity, captured during first-launch onboarding. Mirrors
/// `PlayerProfile` from `src/ipc/contract.ts`. Every field is `#[serde(default)]`
/// so a v3 file (with no `profile`) deserializes into a blank profile.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    #[serde(default)]
    pub first_name: String,
    #[serde(default)]
    pub last_name: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub employee_id: String,
    #[serde(default)]
    pub onboarded_at: String,
}

/// Mirrors `SaveState` from `src/ipc/contract.ts` (v4).
///
/// `taught_commands`, `courses_read`, and `profile` are `#[serde(default)]`-able
/// so older JSON (without those fields) deserializes into a valid in-memory
/// struct with empty values - we still bump `version` + rewrite to keep disk and
/// memory in sync.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveState {
    /// Schema version. v2 added `taughtCommands`; v3 added `coursesRead`;
    /// v4 added `profile`.
    pub version: u32,
    pub current_mission: Option<String>,
    pub completed_missions: Vec<String>,
    pub hints_by_objective: HashMap<String, u32>,
    /// Canonical command names the player has been taught at least once.
    /// Defaults to empty so v1 JSON loads cleanly.
    #[serde(default)]
    pub taught_commands: Vec<String>,
    /// Chapter ids whose theoretical course has been read at least once.
    /// Defaults to empty so v1/v2 JSON loads cleanly.
    #[serde(default)]
    pub courses_read: Vec<String>,
    /// The player's onboarding profile. Defaults to blank so v1/v2/v3 JSON
    /// loads cleanly.
    #[serde(default)]
    pub profile: Profile,
    pub last_played_at: String,
}

impl Default for SaveState {
    fn default() -> Self {
        Self {
            version: CURRENT_VERSION,
            current_mission: None,
            completed_missions: Vec::new(),
            hints_by_objective: HashMap::new(),
            taught_commands: Vec::new(),
            courses_read: Vec::new(),
            profile: Profile::default(),
            last_played_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

fn save_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .context("resolving app data dir")?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .with_context(|| format!("creating {}", dir.display()))?;
    }
    Ok(dir.join(SAVE_FILE))
}

async fn write_state(path: &PathBuf, state: &SaveState) -> Result<(), String> {
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    tokio::fs::write(&tmp, json)
        .await
        .map_err(|e| format!("write tmp {}: {e}", tmp.display()))?;
    tokio::fs::rename(&tmp, path)
        .await
        .map_err(|e| format!("rename {}: {e}", path.display()))?;
    Ok(())
}

/// Load + (if needed) migrate the save file. Used by both the IPC command
/// and other backend modules that need a snapshot of player state.
pub async fn load_state(app: &AppHandle) -> Result<Option<SaveState>, String> {
    let path = save_path(app).map_err(|e| format!("{e:#}"))?;
    if !path.exists() {
        debug!(target: "save", "no save file yet");
        return Ok(None);
    }
    let json = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("read {}: {e}", path.display()))?;
    let mut state: SaveState =
        serde_json::from_str(&json).map_err(|e| format!("parse save.json: {e}"))?;

    if state.version < CURRENT_VERSION {
        info!(
            target: "save",
            from = state.version,
            to = CURRENT_VERSION,
            "migrating SaveState"
        );
        state.version = CURRENT_VERSION;
        // taught_commands already defaulted to [] via serde.
        write_state(&path, &state).await?;
    }

    info!(target: "save", path = %path.display(), version = state.version, "loaded progress");
    Ok(Some(state))
}

/// Convenience for backend callers that just need the player's taught list.
/// Returns `[]` on first run or any read/parse failure (logged).
pub async fn current_taught_commands(app: &AppHandle) -> Vec<String> {
    match load_state(app).await {
        Ok(Some(state)) => state.taught_commands,
        Ok(None) => Vec::new(),
        Err(e) => {
            debug!(target: "save", error = %e, "load_state failed; using empty taught list");
            Vec::new()
        }
    }
}

#[tauri::command]
pub async fn save_progress(app: AppHandle, state: SaveState) -> Result<(), String> {
    let path = save_path(&app).map_err(|e| format!("{e:#}"))?;
    write_state(&path, &state).await?;
    info!(target: "save", path = %path.display(), version = state.version, "saved progress");
    Ok(())
}

#[tauri::command]
pub async fn load_progress(app: AppHandle) -> Result<Option<SaveState>, String> {
    load_state(&app).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_v1_json_with_default_taught_and_courses() {
        let v1 = r#"{
            "version": 1,
            "currentMission": null,
            "completedMissions": ["ch01.mission-01-first-steps"],
            "hintsByObjective": { "pwd_ran": 1 },
            "lastPlayedAt": "2026-05-06T12:00:00Z"
        }"#;
        let s: SaveState = serde_json::from_str(v1).expect("parse v1");
        assert_eq!(s.version, 1);
        assert!(s.taught_commands.is_empty());
        assert!(s.courses_read.is_empty());
        assert_eq!(s.completed_missions.len(), 1);
        assert_eq!(s.hints_by_objective.get("pwd_ran"), Some(&1));
    }

    #[test]
    fn deserializes_v2_json_with_default_courses() {
        // A v2 file (has taughtCommands, no coursesRead) must load cleanly with
        // an empty coursesRead - the in-place migration then bumps the version.
        let v2 = r#"{
            "version": 2,
            "currentMission": null,
            "completedMissions": [],
            "hintsByObjective": {},
            "taughtCommands": ["pwd", "ls"],
            "lastPlayedAt": "2026-05-06T12:00:00Z"
        }"#;
        let s: SaveState = serde_json::from_str(v2).expect("parse v2");
        assert_eq!(s.version, 2);
        assert_eq!(s.taught_commands, vec!["pwd", "ls"]);
        assert!(s.courses_read.is_empty());
    }

    #[test]
    fn deserializes_v3_json_with_default_profile() {
        // A v3 file (has coursesRead, no profile) must load cleanly with a blank
        // profile - the in-place migration then bumps the version.
        let v3 = r#"{
            "version": 3,
            "currentMission": null,
            "completedMissions": ["ch01.mission-01-first-steps"],
            "hintsByObjective": {},
            "taughtCommands": ["pwd", "ls"],
            "coursesRead": ["ch01"],
            "lastPlayedAt": "2026-05-06T12:00:00Z"
        }"#;
        let s: SaveState = serde_json::from_str(v3).expect("parse v3");
        assert_eq!(s.version, 3);
        assert_eq!(s.courses_read, vec!["ch01"]);
        assert!(s.profile.first_name.is_empty());
        assert!(s.profile.last_name.is_empty());
        assert!(s.profile.role.is_empty());
        assert!(s.profile.employee_id.is_empty());
        assert!(s.profile.onboarded_at.is_empty());
        // Progress survives the migration.
        assert_eq!(s.completed_missions.len(), 1);
    }

    #[test]
    fn roundtrips_v4_with_profile() {
        let s = SaveState {
            version: 4,
            current_mission: Some("ch01.mission-02-reading-files".into()),
            completed_missions: vec!["ch01.mission-01-first-steps".into()],
            hints_by_objective: HashMap::new(),
            taught_commands: vec!["pwd".into(), "ls".into()],
            courses_read: vec!["ch01".into()],
            profile: Profile {
                first_name: "Daymari".into(),
                last_name: "Quintero".into(),
                role: "Platform Intern".into(),
                employee_id: "CC-7F3A2".into(),
                onboarded_at: "2026-06-30T09:00:00Z".into(),
            },
            last_played_at: "2026-05-06T12:00:00Z".into(),
        };
        let json = serde_json::to_string(&s).unwrap();
        // Field names must match the TS contract (camelCase).
        assert!(json.contains("\"taughtCommands\":[\"pwd\",\"ls\"]"));
        assert!(json.contains("\"coursesRead\":[\"ch01\"]"));
        assert!(json.contains("\"firstName\":\"Daymari\""));
        assert!(json.contains("\"employeeId\":\"CC-7F3A2\""));
        let back: SaveState = serde_json::from_str(&json).unwrap();
        assert_eq!(back.profile.first_name, "Daymari");
        assert_eq!(back.profile.employee_id, "CC-7F3A2");
        assert_eq!(back.version, 4);
    }
}
