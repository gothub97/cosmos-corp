// Mission orchestrator.
//
// `start_mission` glues every backend module together:
//   1. parse the mission key + locate the mission's content folder,
//   2. read mission.yaml + setup.sh + check.sh + dialogue files,
//   3. ensure the chapter container is up,
//   4. copy setup.sh / check.sh into MISSION_SCRIPTS_DIR and run setup,
//   5. open the PTY into `docker exec` for xterm.js,
//   6. start the validator,
//   7. return MissionState to the frontend.
//
// `reveal_hint`, `reset_chapter`, and `list_content` round out Stream A's
// IPC surface.
//
// Scripts live under /home/dev/.cosmos-mission/ - the lab-images run as the
// non-root `dev` user (uid 1000), which has /opt locked down. Both this
// module and `validator.rs` reference the path through `MISSION_SCRIPTS_DIR`.

/// Where setup.sh / check.sh land inside the chapter container.
pub(crate) const MISSION_SCRIPTS_DIR: &str = "/home/dev/.cosmos-mission";

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;
use tracing::{info, warn};

use crate::commands::cluster::{
    self as cluster, AppClusterState, ClusterViewSpec,
};
use crate::commands::docker::{
    check_docker_health, connect, container_name, destroy_container, ensure_chapter_container,
    exec_bash,
};
use crate::commands::pty;
use crate::validator::{start_validator, ObjectiveSpec, ValidatorHandle};

// ─────────────────────────────────────────────────────────────────────────
// IPC types (mirror src/ipc/contract.ts)
// ─────────────────────────────────────────────────────────────────────────

/// Worked example shown inside a Lesson card.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonExample {
    pub input: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// Teaching content shown before a player attempts an objective.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lesson {
    /// Canonical command name used for "already taught" tracking.
    pub command: String,
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub syntax: Option<String>,
    pub examples: Vec<LessonExample>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectiveOut {
    pub id: String,
    pub label: String,
    pub completed: bool,
    pub hints_revealed: u32,
    /// Optional teaching card. The frontend suppresses it if its `command`
    /// is already in the player's `taughtCommands`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lesson: Option<Lesson>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionState {
    pub key: String,
    pub title: String,
    pub container_image: String,
    pub objectives: Vec<ObjectiveOut>,
    pub intro_dialogue: String,
    pub outro_dialogue: String,
    /// Snapshot of every command the player has been taught up to (and
    /// including) this mission's start. Pulled from SaveState v2.
    pub taught_commands: Vec<String>,
    /// Optional cluster visualization spec for k8s/flux missions. When set,
    /// the UI switches to the viz-primary layout and the Rust side starts a
    /// `cluster:update` polling loop scoped to this spec.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cluster_view: Option<ClusterViewSpec>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterSummary {
    pub id: String,
    pub title: String,
    pub missions: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ContentList {
    pub chapters: Vec<ChapterSummary>,
}

// ─────────────────────────────────────────────────────────────────────────
// Mission YAML schema (consumed from content/<chapter>/<mission>/mission.yaml)
//
// This matches the shape documented in the project plan. Stream C
// (mission-engine) is the authoring source of truth - see SendMessage to
// `mission-engine` if you change this schema.
// ─────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
struct MissionYaml {
    title: String,
    container_image: String,
    #[serde(default)]
    setup: Option<String>,
    #[serde(default)]
    check: Option<String>,
    #[serde(default)]
    intro_dialogue: Option<String>,
    #[serde(default)]
    outro_dialogue: Option<String>,
    objectives: Vec<ObjectiveYaml>,
    /// Optional cluster visualization config for Chapter 3+. Snake-case in
    /// YAML; serialized to camelCase when relayed to the frontend.
    #[serde(default)]
    cluster_view: Option<ClusterViewSpec>,
}

#[derive(Debug, Clone, Deserialize)]
struct ObjectiveYaml {
    id: String,
    label: String,
    #[serde(default)]
    hints: Vec<String>,
    /// Optional teaching card surfaced to the frontend before the player
    /// attempts this objective. See `Lesson` for the schema.
    #[serde(default)]
    lesson: Option<Lesson>,
}

#[derive(Debug, Clone, Deserialize)]
struct ChapterYaml {
    title: String,
}

// ─────────────────────────────────────────────────────────────────────────
// Backend state
// ─────────────────────────────────────────────────────────────────────────

struct ActiveMission {
    key: String,
    chapter_id: String,
    /// Stored for future operations (extra execs, restart) even though the
    /// active flow doesn't read it directly today.
    #[allow(dead_code)]
    container_id: String,
    validator: ValidatorHandle,
    objectives: Vec<ObjectiveOut>,
    /// objective_id → full hint list parsed from yaml
    hints: HashMap<String, Vec<String>>,
    /// objective_id → number revealed so far
    revealed: HashMap<String, u32>,
}

#[derive(Default)]
pub struct AppMissionState {
    inner: Mutex<Option<ActiveMission>>,
}

/// Read-only helper used by `cluster.rs` to learn which chapter container is
/// currently in play (so it can target the right `cosmos-<chapter>` for an
/// inline poll or `kubectl describe`). Returns `None` if no mission is active.
pub async fn active_chapter_id(state: &AppMissionState) -> Option<String> {
    state
        .inner
        .lock()
        .await
        .as_ref()
        .map(|m| m.chapter_id.clone())
}

// ─────────────────────────────────────────────────────────────────────────
// Path resolution
// ─────────────────────────────────────────────────────────────────────────

fn resolve_content_dir(app: &AppHandle) -> Result<PathBuf> {
    if let Ok(env_path) = std::env::var("COSMOS_CONTENT_DIR") {
        let p = PathBuf::from(env_path);
        if p.exists() {
            return Ok(p);
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let p = resource_dir.join("content");
        if p.exists() {
            return Ok(p);
        }
    }

    // Dev fallback: project root is one level up from src-tauri.
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("content");
    if dev.exists() {
        return Ok(dev.canonicalize().unwrap_or(dev));
    }

    Err(anyhow!(
        "Could not locate content directory. Set COSMOS_CONTENT_DIR, bundle resources, \
         or run from the project root."
    ))
}

/// Map "ch01" → "chapter-01-…" subdirectory of the content dir.
fn chapter_dir(content_dir: &Path, chapter_id: &str) -> Result<PathBuf> {
    let n = chapter_id
        .strip_prefix("ch")
        .and_then(|s| s.parse::<u32>().ok())
        .ok_or_else(|| anyhow!("invalid chapter id: {chapter_id}"))?;
    let prefix = format!("chapter-{:02}-", n);
    for entry in std::fs::read_dir(content_dir)
        .with_context(|| format!("read_dir {}", content_dir.display()))?
    {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with(&prefix) {
            return Ok(entry.path());
        }
    }
    Err(anyhow!("no chapter directory matching {prefix}* in {}", content_dir.display()))
}

/// Stream C's authoring convention is that the mission folder name *is* the
/// slug (e.g. `mission-01-first-steps`). We accept that as the canonical
/// form, plus the older `m01-first-steps` shorthand documented in the IPC
/// contract's JSDoc - for safety as the codebase migrates.
fn mission_dir(chapter_dir: &Path, slug: &str) -> Result<PathBuf> {
    // Canonical form: slug is the directory name.
    let direct = chapter_dir.join(slug);
    if direct.is_dir() {
        return Ok(direct);
    }

    // Legacy shorthand: "m01-first-steps" → "mission-01-first-steps".
    if let Some(rest) = slug.strip_prefix('m') {
        let target = format!("mission-{rest}");
        let p = chapter_dir.join(&target);
        if p.is_dir() {
            return Ok(p);
        }
    }

    Err(anyhow!(
        "mission directory {} not found in {}",
        slug,
        chapter_dir.display()
    ))
}

fn parse_mission_key(key: &str) -> Result<(String, String)> {
    let mut parts = key.splitn(2, '.');
    let chapter = parts
        .next()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| anyhow!("missionKey missing chapter: {key}"))?;
    let slug = parts
        .next()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| anyhow!("missionKey missing slug: {key}"))?;
    Ok((chapter.to_string(), slug.to_string()))
}

// ─────────────────────────────────────────────────────────────────────────
// Container helpers
// ─────────────────────────────────────────────────────────────────────────

/// Copy a file's bytes into the container at `dest`, then chmod +x. We
/// base64-encode locally and decode in-container so file content never goes
/// through shell quoting. `dest` must live under a directory the container's
/// runtime user (uid 1000 `dev`) can write to - see `MISSION_SCRIPTS_DIR`.
async fn copy_executable_into_container(
    docker: &bollard::Docker,
    container_id: &str,
    dest: &str,
    content: &str,
) -> Result<()> {
    let encoded = base64::engine::general_purpose::STANDARD.encode(content);
    let dest_q = single_quote(dest);
    let dir_q = single_quote(MISSION_SCRIPTS_DIR);
    let script = format!(
        "set -e\nmkdir -p {dir_q}\nprintf '%s' '{encoded}' | base64 -d > {dest_q}\nchmod +x {dest_q}\n"
    );
    let out = exec_bash(docker, container_id, &script).await?;
    if !out.ok() {
        return Err(anyhow!(
            "copying {dest} into container failed (exit {}): {}",
            out.exit_code,
            out.stderr.trim()
        ));
    }
    Ok(())
}

fn single_quote(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('\'');
    for c in s.chars() {
        if c == '\'' {
            out.push_str("'\\''");
        } else {
            out.push(c);
        }
    }
    out.push('\'');
    out
}

fn read_optional_file(dir: &Path, name: &Option<String>) -> Result<Option<String>> {
    let Some(name) = name else { return Ok(None) };
    let p = dir.join(name);
    if !p.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&p)
        .with_context(|| format!("reading {}", p.display()))?;
    Ok(Some(content))
}

// ─────────────────────────────────────────────────────────────────────────
// Tauri commands
// ─────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_content(app: AppHandle) -> Result<ContentList, String> {
    let content_dir = resolve_content_dir(&app).map_err(|e| format!("{e:#}"))?;
    let mut chapters = Vec::new();

    let mut entries: Vec<_> = std::fs::read_dir(&content_dir)
        .map_err(|e| format!("read content dir: {e}"))?
        .filter_map(|r| r.ok())
        .filter(|e| {
            e.file_type()
                .map(|t| t.is_dir())
                .unwrap_or(false)
                && e.file_name()
                    .to_string_lossy()
                    .starts_with("chapter-")
        })
        .collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let dir = entry.path();
        let dir_name = entry.file_name().to_string_lossy().to_string();
        // chapter-NN-rest
        let after_prefix = match dir_name.strip_prefix("chapter-") {
            Some(s) => s,
            None => continue,
        };
        let mut nn_rest = after_prefix.splitn(2, '-');
        let nn = match nn_rest.next().and_then(|s| s.parse::<u32>().ok()) {
            Some(n) => n,
            None => continue,
        };
        let chapter_id = format!("ch{:02}", nn);

        let title = match std::fs::read_to_string(dir.join("chapter.yaml")) {
            Ok(yaml) => serde_yaml::from_str::<ChapterYaml>(&yaml)
                .map(|c| c.title)
                .unwrap_or_else(|_| dir_name.clone()),
            Err(_) => dir_name.clone(),
        };

        let mut missions = Vec::new();
        let mut mission_entries: Vec<_> = std::fs::read_dir(&dir)
            .map_err(|e| format!("read chapter dir {}: {e}", dir.display()))?
            .filter_map(|r| r.ok())
            .filter(|e| {
                e.file_type().map(|t| t.is_dir()).unwrap_or(false)
                    && e.file_name().to_string_lossy().starts_with("mission-")
            })
            .collect();
        mission_entries.sort_by_key(|e| e.file_name());
        for m_entry in mission_entries {
            let m_name = m_entry.file_name().to_string_lossy().to_string();
            // The slug is the folder name; key is "{chapter}.{slug}".
            // e.g. "mission-01-first-steps" → "ch01.mission-01-first-steps"
            missions.push(format!("{chapter_id}.{m_name}"));
        }

        chapters.push(ChapterSummary {
            id: chapter_id,
            title,
            missions,
        });
    }

    Ok(ContentList { chapters })
}

#[tauri::command]
pub async fn start_mission(
    app: AppHandle,
    state: State<'_, AppMissionState>,
    cluster_state: State<'_, AppClusterState>,
    key: String,
) -> Result<MissionState, String> {
    start_mission_inner(&app, &state, &cluster_state, key)
        .await
        .map_err(|e| format!("{e:#}"))
}

async fn start_mission_inner(
    app: &AppHandle,
    state: &AppMissionState,
    cluster_state: &AppClusterState,
    key: String,
) -> Result<MissionState> {
    info!(target: "mission", key = %key, "starting mission");

    // 1. Locate mission content.
    let (chapter_id, slug) = parse_mission_key(&key)?;
    let content_dir = resolve_content_dir(app)?;
    let chap_dir = chapter_dir(&content_dir, &chapter_id)?;
    let m_dir = mission_dir(&chap_dir, &slug)?;

    let yaml_text = std::fs::read_to_string(m_dir.join("mission.yaml"))
        .with_context(|| format!("reading {}/mission.yaml", m_dir.display()))?;
    let mission: MissionYaml =
        serde_yaml::from_str(&yaml_text).context("parsing mission.yaml")?;

    let setup_script = read_optional_file(&m_dir, &mission.setup)?;
    let check_script = read_optional_file(&m_dir, &mission.check)?;
    let intro_dialogue =
        read_optional_file(&m_dir, &mission.intro_dialogue)?.unwrap_or_default();
    let outro_dialogue =
        read_optional_file(&m_dir, &mission.outro_dialogue)?.unwrap_or_default();

    // 2. Stop any prior mission cleanly.
    {
        let mut guard = state.inner.lock().await;
        if let Some(prev) = guard.take() {
            info!(target: "mission", prev = %prev.key, "stopping previous mission");
            prev.validator.stop().await;
        }
    }
    pty::close_session();
    // Tear down any prior cluster watcher before we touch a new container -
    // safe even if the previous mission didn't have one.
    cluster::stop_watcher(cluster_state).await;

    // 3. Make sure Docker is reachable; emit status events.
    let _ = app.emit(
        "docker:status",
        serde_json::json!({ "state": "starting" }),
    );
    let health = check_docker_health().await;
    if !health.ok {
        let msg = health
            .reason
            .clone()
            .unwrap_or_else(|| "Docker is not available".into());
        let _ = app.emit(
            "docker:status",
            serde_json::json!({ "state": "error", "message": msg }),
        );
        return Err(anyhow!(msg));
    }

    let docker = connect().await?;

    // 4. Ensure container.
    let container_id =
        ensure_chapter_container(&docker, &chapter_id, &mission.container_image).await?;
    let _ = app.emit(
        "docker:status",
        serde_json::json!({ "state": "ready" }),
    );

    // 5. Stage scripts into the container (writable by user `dev`).
    let setup_path = format!("{MISSION_SCRIPTS_DIR}/setup.sh");
    let check_path = format!("{MISSION_SCRIPTS_DIR}/check.sh");
    if let Some(setup) = setup_script.as_deref() {
        copy_executable_into_container(&docker, &container_id, &setup_path, setup).await?;
        let out = exec_bash(&docker, &container_id, &setup_path).await?;
        if !out.ok() {
            warn!(
                target: "mission",
                exit = out.exit_code,
                stderr = %out.stderr.trim(),
                "setup.sh exited non-zero"
            );
        }
    }
    if let Some(check) = check_script.as_deref() {
        copy_executable_into_container(&docker, &container_id, &check_path, check).await?;
    }

    // 6. Open PTY. Force the player shell to run as `dev` on lab images
    // whose default USER is root (k8s-lab / flux-lab). See `pty_user_for_image`
    // for the rationale.
    let pty_user = crate::commands::docker::pty_user_for_image(&mission.container_image);
    pty::open_container_pty(app, &container_id, pty_user)?;

    // 7. Start validator.
    let objective_specs: Vec<ObjectiveSpec> = mission
        .objectives
        .iter()
        .map(|o| ObjectiveSpec { id: o.id.clone() })
        .collect();
    let validator = start_validator(
        app.clone(),
        docker.clone(),
        container_id.clone(),
        key.clone(),
        objective_specs,
    );

    // 8. Build response.
    let objectives_out: Vec<ObjectiveOut> = mission
        .objectives
        .iter()
        .map(|o| ObjectiveOut {
            id: o.id.clone(),
            label: o.label.clone(),
            completed: false,
            hints_revealed: 0,
            lesson: o.lesson.clone(),
        })
        .collect();

    let hints: HashMap<String, Vec<String>> = mission
        .objectives
        .iter()
        .map(|o| (o.id.clone(), o.hints.clone()))
        .collect();
    let revealed: HashMap<String, u32> = mission
        .objectives
        .iter()
        .map(|o| (o.id.clone(), 0))
        .collect();

    // Snapshot the player's taught_commands at mission-start time so the UI
    // can decide which lesson cards to suppress. SaveState v2 owns the list;
    // the engine bumps it after a lesson is acknowledged.
    let taught_commands = crate::commands::save::current_taught_commands(app).await;

    let response = MissionState {
        key: key.clone(),
        title: mission.title.clone(),
        container_image: mission.container_image.clone(),
        objectives: objectives_out.clone(),
        intro_dialogue,
        outro_dialogue,
        taught_commands,
        cluster_view: mission.cluster_view.clone(),
    };

    // 9. If this mission has a cluster view, start the watcher for it. Done
    // after we've populated the response so we never start a watcher for a
    // mission we then fail to construct.
    if let Some(spec) = mission.cluster_view.clone() {
        if let Err(e) = cluster::start_watcher(app, cluster_state, chapter_id.clone(), spec).await {
            warn!(target: "mission", error = %e, "failed to start cluster watcher");
        }
    }

    {
        let mut guard = state.inner.lock().await;
        *guard = Some(ActiveMission {
            key,
            chapter_id,
            container_id,
            validator,
            objectives: objectives_out,
            hints,
            revealed,
        });
    }

    Ok(response)
}

#[derive(Serialize)]
pub struct HintResponse {
    pub text: String,
}

#[tauri::command]
pub async fn reveal_hint(
    state: State<'_, AppMissionState>,
    objective_id: String,
) -> Result<HintResponse, String> {
    let mut guard = state.inner.lock().await;
    let active = guard
        .as_mut()
        .ok_or_else(|| "no active mission".to_string())?;
    let hints = active
        .hints
        .get(&objective_id)
        .ok_or_else(|| format!("unknown objective: {objective_id}"))?;
    if hints.is_empty() {
        return Err(format!("objective {objective_id} has no hints"));
    }
    let revealed = active.revealed.entry(objective_id.clone()).or_insert(0);
    let idx = (*revealed as usize).min(hints.len() - 1);
    let text = hints[idx].clone();
    *revealed = (*revealed + 1).min(hints.len() as u32);
    // Mirror onto the cached objective list for any UI that reads it.
    if let Some(o) = active.objectives.iter_mut().find(|o| o.id == objective_id) {
        o.hints_revealed = *revealed;
    }
    Ok(HintResponse { text })
}

#[tauri::command]
pub async fn reset_chapter(
    app: AppHandle,
    state: State<'_, AppMissionState>,
    cluster_state: State<'_, AppClusterState>,
    chapter: String,
) -> Result<(), String> {
    reset_chapter_inner(&app, &state, &cluster_state, chapter)
        .await
        .map_err(|e| format!("{e:#}"))
}

async fn reset_chapter_inner(
    _app: &AppHandle,
    state: &AppMissionState,
    cluster_state: &AppClusterState,
    chapter: String,
) -> Result<()> {
    info!(target: "mission", chapter = %chapter, "resetting chapter");

    // Stop the active mission if it's in this chapter.
    {
        let mut guard = state.inner.lock().await;
        if let Some(active) = guard.as_ref() {
            if active.chapter_id == chapter {
                let prev = guard.take().unwrap();
                prev.validator.stop().await;
            }
        }
    }
    pty::close_session();
    // Always tear down the cluster watcher on reset - cheap if there isn't one.
    cluster::stop_watcher(cluster_state).await;

    // Destroy the container if it exists.
    let docker = connect().await?;
    let name = container_name(&chapter);
    // Best effort - bollard returns 404 if it's already gone, which we ignore.
    match destroy_container(&docker, &name).await {
        Ok(_) => info!(target: "mission", chapter = %chapter, "container removed"),
        Err(e) => {
            // Try by-id too (in case `name` only resolves through filter).
            warn!(target: "mission", error = %e, "remove by name failed; container may already be gone");
        }
    }
    Ok(())
}

/// Construct the initial `AppMissionState` so `lib.rs` can pass it to
/// `Builder::manage` without needing visibility into the private fields.
pub fn manage_state() -> AppMissionState {
    AppMissionState::default()
}
