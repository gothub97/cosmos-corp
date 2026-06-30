// Cluster watcher.
//
// Owned by the mission orchestrator: while a mission with `clusterView` is
// active, this tokio task ticks every `pollIntervalMs` (default 2s, floor
// 500ms):
//
//   1. For each kind in the spec, run `kubectl get -o json <kind> [-n <ns>]`
//      inside the chapter container as the `dev` user. We use bollard's exec
//      API directly so we don't have to spawn a host `docker` process.
//   2. Parse the resulting `List` JSON and normalize each item into
//      `K8sResource` (camelCase to match `src/ipc/contract.ts`).
//   3. Merge into a single `ClusterSnapshot`. If anything that matters has
//      changed (added / removed / status / labels / replicas / etc.), bump
//      `version` and emit a `cluster:update` event.
//
// `AppClusterState` keeps the latest snapshot so the UI can:
//   - render an initial frame synchronously via `get_cluster_snapshot`,
//   - run `kubectl describe` against any node by uid via `describe_resource`.
//
// Status strings are normalized to a stable vocabulary so the UI can render
// status pills generically:
//
//     Running | Pending | Failed | CrashLoopBackOff |
//     Ready   | NotReady | Succeeded | Terminating |
//     Reconciling | Stalled | Suspended   (Flux CRDs - Chapter 4)
//
// On mission stop / chapter reset / mission swap, the watcher is stopped and
// the snapshot cleared.

use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use bollard::Docker;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{Mutex as TokioMutex, Notify};
use tokio::task::JoinHandle;
use tracing::{debug, info, warn};

use crate::commands::docker::{connect, container_name, exec_capture_as};
use crate::commands::mission::{active_chapter_id, AppMissionState};

// ─────────────────────────────────────────────────────────────────────────
// IPC types - mirror src/ipc/contract.ts (camelCase via serde rename).
// ─────────────────────────────────────────────────────────────────────────

/// Subset of Kubernetes kinds the watcher can normalize.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum K8sKind {
    Namespace,
    Node,
    Deployment,
    Replicaset,
    Pod,
    Service,
    Configmap,
    Secret,
    // ── Flux CRDs (Chapter 4) ──
    Gitrepository,
    Kustomization,
}

impl K8sKind {
    /// kubectl resource type name. Core kinds use the lowercase singular
    /// (kubectl is happy with it). Flux CRDs use the **fully-qualified**
    /// `<plural>.<group>` form so `kubectl get` never collides with an
    /// unrelated short name and works even before the short alias registers.
    fn kubectl_name(self) -> &'static str {
        match self {
            K8sKind::Namespace => "namespace",
            K8sKind::Node => "node",
            K8sKind::Deployment => "deployment",
            K8sKind::Replicaset => "replicaset",
            K8sKind::Pod => "pod",
            K8sKind::Service => "service",
            K8sKind::Configmap => "configmap",
            K8sKind::Secret => "secret",
            K8sKind::Gitrepository => "gitrepositories.source.toolkit.fluxcd.io",
            K8sKind::Kustomization => "kustomizations.kustomize.toolkit.fluxcd.io",
        }
    }

    fn is_namespaced(self) -> bool {
        !matches!(self, K8sKind::Namespace | K8sKind::Node)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnerRef {
    pub kind: String,
    pub name: String,
    pub uid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplicaCounts {
    pub desired: u32,
    pub ready: u32,
    pub available: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServicePort {
    pub port: u32,
    /// Target port can be either a string (named) or a number.
    pub target_port: Value,
    pub protocol: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node_port: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerStatus {
    pub name: String,
    pub ready: bool,
    pub restart_count: u32,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct K8sResource {
    pub kind: K8sKind,
    pub uid: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub namespace: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner_refs: Option<Vec<OwnerRef>>,

    // ── Deployment / ReplicaSet ──
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub replicas: Option<ReplicaCounts>,

    // ── Service ──
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selector: Option<BTreeMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ports: Option<Vec<ServicePort>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub service_type: Option<String>,

    // ── Pod ──
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub labels: Option<BTreeMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pod_ip: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub container_statuses: Option<Vec<ContainerStatus>>,

    // ── Flux (Kustomization) ──
    /// `.spec.sourceRef.name` - the GitRepository this Kustomization reconciles
    /// from. Lets the UI draw the Kustomization → GitRepository edge.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_ref: Option<String>,

    /// Wallclock seconds since metadata.creationTimestamp.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub age_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClusterSnapshot {
    pub resources: HashMap<String, K8sResource>,
    pub version: u64,
    pub sampled_at: String,
}

impl ClusterSnapshot {
    fn empty() -> Self {
        Self {
            resources: HashMap::new(),
            version: 0,
            sampled_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

/// Cluster view spec. Serializes as camelCase to match the IPC contract
/// (`src/ipc/contract.ts`), but each field also accepts the snake_case
/// alias so it can be authored verbatim in `mission.yaml` (which uses
/// snake_case throughout).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClusterViewSpec {
    #[serde(default, alias = "watch_namespace", skip_serializing_if = "Option::is_none")]
    pub watch_namespace: Option<String>,
    #[serde(default, alias = "watch_kinds", skip_serializing_if = "Option::is_none")]
    pub watch_kinds: Option<Vec<K8sKind>>,
    #[serde(default, alias = "poll_interval_ms", skip_serializing_if = "Option::is_none")]
    pub poll_interval_ms: Option<u64>,
}

impl ClusterViewSpec {
    fn effective_kinds(&self) -> Vec<K8sKind> {
        self.watch_kinds.clone().unwrap_or_else(|| {
            vec![
                K8sKind::Deployment,
                K8sKind::Replicaset,
                K8sKind::Pod,
                K8sKind::Service,
            ]
        })
    }

    fn effective_interval(&self) -> Duration {
        const DEFAULT_MS: u64 = 2000;
        const FLOOR_MS: u64 = 500;
        let ms = self.poll_interval_ms.unwrap_or(DEFAULT_MS).max(FLOOR_MS);
        Duration::from_millis(ms)
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Backend state
// ─────────────────────────────────────────────────────────────────────────

#[derive(Default)]
struct ClusterRuntime {
    /// Current watcher, if any. Stopped when replaced or on chapter reset.
    handle: Option<WatcherHandle>,
    /// Latest snapshot emitted (or fetched inline). `None` means no watcher
    /// has ever produced a snapshot for this session.
    snapshot: Option<ClusterSnapshot>,
}

#[derive(Default)]
pub struct AppClusterState {
    inner: Arc<TokioMutex<ClusterRuntime>>,
}

impl AppClusterState {
    fn arc(&self) -> Arc<TokioMutex<ClusterRuntime>> {
        self.inner.clone()
    }
}

pub fn manage_state() -> AppClusterState {
    AppClusterState::default()
}

struct WatcherHandle {
    stop: Arc<Notify>,
    join: JoinHandle<()>,
    chapter_id: String,
}

impl WatcherHandle {
    async fn stop(self) {
        self.stop.notify_waiters();
        match tokio::time::timeout(Duration::from_secs(5), self.join).await {
            Ok(_) => {}
            Err(_) => warn!(
                target: "cluster",
                chapter = %self.chapter_id,
                "cluster watcher did not stop within 5s - abandoning"
            ),
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Public lifecycle hooks (called by mission.rs)
// ─────────────────────────────────────────────────────────────────────────

/// Stop any prior watcher and start a new one for this mission. Called from
/// `start_mission` when the mission YAML has a `cluster_view` block.
pub async fn start_watcher(
    app: &AppHandle,
    state: &AppClusterState,
    chapter_id: String,
    spec: ClusterViewSpec,
) -> Result<()> {
    let cname = container_name(&chapter_id);
    info!(
        target: "cluster",
        chapter = %chapter_id,
        container = %cname,
        kinds = ?spec.effective_kinds(),
        ns = ?spec.watch_namespace,
        interval_ms = ?spec.poll_interval_ms,
        "starting cluster watcher"
    );

    // Stop any prior watcher first.
    stop_watcher(state).await;

    let stop = Arc::new(Notify::new());
    let stop_for_task = stop.clone();
    let app_for_task = app.clone();
    let runtime = state.arc();
    let chapter_for_task = chapter_id.clone();
    let spec_for_task = spec.clone();
    let cname_for_task = cname.clone();

    let join = tokio::spawn(async move {
        run_loop(
            app_for_task,
            runtime,
            chapter_for_task,
            cname_for_task,
            spec_for_task,
            stop_for_task,
        )
        .await;
    });

    let mut guard = state.inner.lock().await;
    guard.handle = Some(WatcherHandle {
        stop,
        join,
        chapter_id,
    });
    Ok(())
}

/// Stop the active watcher (if any) and clear the cached snapshot. Called on
/// mission swap and chapter reset.
pub async fn stop_watcher(state: &AppClusterState) {
    let prev = {
        let mut guard = state.inner.lock().await;
        let handle = guard.handle.take();
        guard.snapshot = None;
        handle
    };
    if let Some(h) = prev {
        h.stop().await;
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Polling loop
// ─────────────────────────────────────────────────────────────────────────

async fn run_loop(
    app: AppHandle,
    runtime: Arc<TokioMutex<ClusterRuntime>>,
    chapter_id: String,
    container_name: String,
    spec: ClusterViewSpec,
    stop: Arc<Notify>,
) {
    let interval = spec.effective_interval();
    let mut ticker = tokio::time::interval(interval);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    let stop_fut = stop.notified();
    tokio::pin!(stop_fut);

    let mut version: u64 = 0;
    let mut prev_resources: HashMap<String, K8sResource> = HashMap::new();
    let mut docker = match connect().await {
        Ok(d) => d,
        Err(e) => {
            warn!(target: "cluster", error = %e, "cannot connect to docker; cluster watcher exiting");
            return;
        }
    };

    info!(target: "cluster", chapter = %chapter_id, "watcher loop running");

    loop {
        tokio::select! {
            biased;
            _ = &mut stop_fut => {
                info!(target: "cluster", chapter = %chapter_id, "stop requested");
                break;
            }
            _ = ticker.tick() => {
                match poll_once(&docker, &container_name, &spec).await {
                    Ok(next) => {
                        if snapshots_differ(&prev_resources, &next) {
                            version = version.wrapping_add(1);
                            let snapshot = ClusterSnapshot {
                                resources: next.clone(),
                                version,
                                sampled_at: chrono::Utc::now().to_rfc3339(),
                            };
                            {
                                let mut guard = runtime.lock().await;
                                guard.snapshot = Some(snapshot.clone());
                            }
                            if let Err(e) = app.emit("cluster:update", &snapshot) {
                                warn!(target: "cluster", error = %e, "emit cluster:update failed");
                            }
                            prev_resources = next;
                        } else {
                            debug!(target: "cluster", "tick: no diff");
                        }
                    }
                    Err(e) => {
                        warn!(target: "cluster", error = %e, "poll failed; retrying next tick");
                        // Try reconnecting docker on the next iteration if the
                        // error looks like a connection drop.
                        if e.to_string().to_lowercase().contains("connection") {
                            if let Ok(d) = connect().await {
                                docker = d;
                            }
                        }
                    }
                }
            }
        }
    }

    info!(target: "cluster", chapter = %chapter_id, "watcher stopped");
}

/// Run one poll cycle: fetch each kind in the spec, normalize, merge.
/// Returns the merged map keyed by uid. Bails on the first kind that fails
/// - we'd rather skip a tick than render a partial cluster.
async fn poll_once(
    docker: &Docker,
    container: &str,
    spec: &ClusterViewSpec,
) -> Result<HashMap<String, K8sResource>> {
    let kinds = spec.effective_kinds();
    let mut out: HashMap<String, K8sResource> = HashMap::new();
    let now = chrono::Utc::now();

    for kind in kinds {
        let mut cmd = vec!["kubectl".to_string(), "get".to_string(), kind.kubectl_name().to_string(), "-o".to_string(), "json".to_string()];
        if kind.is_namespaced() {
            match &spec.watch_namespace {
                Some(ns) => {
                    cmd.push("-n".into());
                    cmd.push(ns.clone());
                }
                None => cmd.push("--all-namespaces".into()),
            }
        }
        let exec = exec_capture_as(docker, container, cmd, Some("dev"))
            .await
            .with_context(|| format!("kubectl get {}", kind.kubectl_name()))?;
        if !exec.ok() {
            return Err(anyhow!(
                "kubectl get {} failed (exit {}): {}",
                kind.kubectl_name(),
                exec.exit_code,
                exec.stderr.trim()
            ));
        }
        let parsed: Value = serde_json::from_str(&exec.stdout)
            .with_context(|| format!("parse JSON for {}", kind.kubectl_name()))?;
        let items = parsed
            .get("items")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        for item in items {
            if let Some(r) = normalize_item(kind, &item, now) {
                out.insert(r.uid.clone(), r);
            }
        }
    }

    Ok(out)
}

// ─────────────────────────────────────────────────────────────────────────
// Normalization helpers
// ─────────────────────────────────────────────────────────────────────────

fn normalize_item(kind: K8sKind, item: &Value, now: chrono::DateTime<chrono::Utc>) -> Option<K8sResource> {
    let metadata = item.get("metadata")?.as_object()?;
    let uid = metadata.get("uid").and_then(|v| v.as_str())?.to_string();
    let name = metadata.get("name").and_then(|v| v.as_str())?.to_string();
    let namespace = metadata
        .get("namespace")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let owner_refs = metadata
        .get("ownerReferences")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|o| {
                    let o = o.as_object()?;
                    Some(OwnerRef {
                        kind: o.get("kind")?.as_str()?.to_string(),
                        name: o.get("name")?.as_str()?.to_string(),
                        uid: o.get("uid")?.as_str()?.to_string(),
                    })
                })
                .collect::<Vec<_>>()
        })
        .filter(|v: &Vec<OwnerRef>| !v.is_empty());
    let labels = metadata.get("labels").and_then(|v| v.as_object()).map(|map| {
        let mut bt = BTreeMap::new();
        for (k, v) in map {
            if let Some(s) = v.as_str() {
                bt.insert(k.clone(), s.to_string());
            }
        }
        bt
    });
    let age_seconds = metadata
        .get("creationTimestamp")
        .and_then(|v| v.as_str())
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|t| {
            let secs = (now - t.with_timezone(&chrono::Utc)).num_seconds();
            if secs < 0 {
                0u64
            } else {
                secs as u64
            }
        });
    let terminating = metadata
        .get("deletionTimestamp")
        .map(|v| !v.is_null())
        .unwrap_or(false);

    let mut res = K8sResource {
        kind,
        uid,
        name,
        namespace,
        status: None,
        owner_refs,
        replicas: None,
        selector: None,
        ports: None,
        service_type: None,
        // Labels are needed for Pods (display) and for Deployments + Flux CRDs
        // so the UI can draw Flux edges via the `kustomize.toolkit.fluxcd.io/name`
        // label that kustomize-controller stamps on every managed object.
        labels: if matches!(
            kind,
            K8sKind::Pod | K8sKind::Deployment | K8sKind::Gitrepository | K8sKind::Kustomization
        ) {
            labels.clone()
        } else {
            None
        },
        pod_ip: None,
        node_name: None,
        container_statuses: None,
        source_ref: None,
        age_seconds,
    };

    let spec = item.get("spec").and_then(|v| v.as_object());
    let status = item.get("status").and_then(|v| v.as_object());

    match kind {
        K8sKind::Pod => {
            res.pod_ip = status
                .and_then(|s| s.get("podIP"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            res.node_name = spec
                .and_then(|s| s.get("nodeName"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let containers = status
                .and_then(|s| s.get("containerStatuses"))
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|c| {
                            let c = c.as_object()?;
                            Some(ContainerStatus {
                                name: c.get("name")?.as_str()?.to_string(),
                                ready: c.get("ready")?.as_bool().unwrap_or(false),
                                restart_count: c
                                    .get("restartCount")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0)
                                    as u32,
                                state: container_state_string(c.get("state")),
                            })
                        })
                        .collect::<Vec<_>>()
                })
                .filter(|v: &Vec<ContainerStatus>| !v.is_empty());
            res.container_statuses = containers.clone();
            res.status = Some(pod_status(status, containers.as_deref(), terminating));
        }
        K8sKind::Deployment | K8sKind::Replicaset => {
            let desired = spec
                .and_then(|s| s.get("replicas"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;
            let ready = status
                .and_then(|s| s.get("readyReplicas"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;
            let available = status
                .and_then(|s| s.get("availableReplicas"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;
            res.replicas = Some(ReplicaCounts {
                desired,
                ready,
                available,
            });
            res.status = Some(if terminating {
                "Terminating".into()
            } else if desired == 0 || available >= desired {
                "Ready".into()
            } else {
                "NotReady".into()
            });
        }
        K8sKind::Service => {
            res.service_type = spec
                .and_then(|s| s.get("type"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            res.selector = spec
                .and_then(|s| s.get("selector"))
                .and_then(|v| v.as_object())
                .map(|map| {
                    let mut bt = BTreeMap::new();
                    for (k, v) in map {
                        if let Some(s) = v.as_str() {
                            bt.insert(k.clone(), s.to_string());
                        }
                    }
                    bt
                });
            res.ports = spec
                .and_then(|s| s.get("ports"))
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|p| {
                            let p = p.as_object()?;
                            let port = p.get("port")?.as_u64()? as u32;
                            let target_port = p
                                .get("targetPort")
                                .cloned()
                                .unwrap_or(Value::Number(port.into()));
                            let protocol = p
                                .get("protocol")
                                .and_then(|v| v.as_str())
                                .unwrap_or("TCP")
                                .to_string();
                            let node_port = p.get("nodePort").and_then(|v| v.as_u64()).map(|n| n as u32);
                            Some(ServicePort {
                                port,
                                target_port,
                                protocol,
                                node_port,
                            })
                        })
                        .collect::<Vec<_>>()
                })
                .filter(|v: &Vec<ServicePort>| !v.is_empty());
            res.status = Some(if terminating { "Terminating".into() } else { "Ready".into() });
        }
        K8sKind::Node => {
            let ready_cond = status
                .and_then(|s| s.get("conditions"))
                .and_then(|v| v.as_array())
                .and_then(|arr| {
                    arr.iter().find_map(|c| {
                        let c = c.as_object()?;
                        if c.get("type")?.as_str()? == "Ready" {
                            Some(c.get("status")?.as_str()?.to_string())
                        } else {
                            None
                        }
                    })
                });
            res.status = Some(match ready_cond.as_deref() {
                Some("True") => "Ready".into(),
                _ => "NotReady".into(),
            });
        }
        K8sKind::Namespace => {
            let phase = status
                .and_then(|s| s.get("phase"))
                .and_then(|v| v.as_str())
                .unwrap_or("Active");
            res.status = Some(match phase {
                "Active" => "Ready".into(),
                "Terminating" => "Terminating".into(),
                other => other.to_string(),
            });
        }
        K8sKind::Configmap | K8sKind::Secret => {
            res.status = Some(if terminating { "Terminating".into() } else { "Ready".into() });
        }
        K8sKind::Gitrepository | K8sKind::Kustomization => {
            // Kustomization → GitRepository edge: surface the source it points at.
            if matches!(kind, K8sKind::Kustomization) {
                res.source_ref = spec
                    .and_then(|s| s.get("sourceRef"))
                    .and_then(|v| v.as_object())
                    .and_then(|o| o.get("name"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
            }
            let suspended = spec
                .and_then(|s| s.get("suspend"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            res.status = Some(if terminating {
                "Terminating".into()
            } else if suspended {
                "Suspended".into()
            } else {
                flux_ready_status(status)
            });
        }
    }

    Some(res)
}

/// Map a Flux resource's `Ready` condition to the UI status vocabulary.
/// Flux reports readiness via `.status.conditions[type==Ready]`:
///   - `status==True`                       → Ready
///   - `status==False`, reason `*Failed`    → Stalled (terminal - needs a fix)
///   - `status==False`, other reasons       → Reconciling (Progressing / waiting)
///   - missing / Unknown                    → Reconciling (not observed yet)
fn flux_ready_status(status: Option<&serde_json::Map<String, Value>>) -> String {
    let cond = status
        .and_then(|s| s.get("conditions"))
        .and_then(|v| v.as_array())
        .and_then(|arr| {
            arr.iter().find_map(|c| {
                let c = c.as_object()?;
                if c.get("type")?.as_str()? == "Ready" {
                    Some((
                        c.get("status")?.as_str()?.to_string(),
                        c.get("reason")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                    ))
                } else {
                    None
                }
            })
        });
    match cond {
        Some((s, _)) if s == "True" => "Ready".into(),
        Some((s, reason)) if s == "False" => {
            if reason.ends_with("Failed") || reason == "Stalled" {
                "Stalled".into()
            } else {
                "Reconciling".into()
            }
        }
        _ => "Reconciling".into(),
    }
}

/// Best-effort textual representation of the per-container `state` block.
/// Examples: "running", "waiting:CrashLoopBackOff", "terminated:Completed".
fn container_state_string(state: Option<&Value>) -> String {
    let Some(obj) = state.and_then(|v| v.as_object()) else {
        return "unknown".into();
    };
    if obj.contains_key("running") {
        return "running".into();
    }
    if let Some(w) = obj.get("waiting").and_then(|v| v.as_object()) {
        let reason = w.get("reason").and_then(|v| v.as_str()).unwrap_or("Waiting");
        return format!("waiting:{reason}");
    }
    if let Some(t) = obj.get("terminated").and_then(|v| v.as_object()) {
        let reason = t.get("reason").and_then(|v| v.as_str()).unwrap_or("Terminated");
        return format!("terminated:{reason}");
    }
    "unknown".into()
}

/// Compute the normalized status string for a Pod. Order of precedence:
/// Terminating > CrashLoopBackOff (any container) > phase mapping.
fn pod_status(
    status: Option<&serde_json::Map<String, Value>>,
    containers: Option<&[ContainerStatus]>,
    terminating: bool,
) -> String {
    if terminating {
        return "Terminating".into();
    }
    if let Some(cs) = containers {
        for c in cs {
            if c.state.starts_with("waiting:CrashLoopBackOff") {
                return "CrashLoopBackOff".into();
            }
        }
    }
    let phase = status
        .and_then(|s| s.get("phase"))
        .and_then(|v| v.as_str())
        .unwrap_or("Pending");
    match phase {
        "Running" => "Running".into(),
        "Pending" => "Pending".into(),
        "Failed" => "Failed".into(),
        "Succeeded" => "Succeeded".into(),
        other => other.to_string(),
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Diffing
// ─────────────────────────────────────────────────────────────────────────

/// Returns true if `next` differs from `prev` in any field that the UI cares
/// about. `age_seconds` is intentionally excluded - it always changes between
/// ticks and would force a useless re-render every cycle.
pub fn snapshots_differ(
    prev: &HashMap<String, K8sResource>,
    next: &HashMap<String, K8sResource>,
) -> bool {
    if prev.len() != next.len() {
        return true;
    }
    for (uid, n) in next {
        match prev.get(uid) {
            None => return true,
            Some(p) => {
                if !relevant_eq(p, n) {
                    return true;
                }
            }
        }
    }
    false
}

fn relevant_eq(a: &K8sResource, b: &K8sResource) -> bool {
    a.kind == b.kind
        && a.uid == b.uid
        && a.name == b.name
        && a.namespace == b.namespace
        && a.status == b.status
        && a.owner_refs_eq(b)
        && a.replicas_eq(b)
        && a.selector == b.selector
        && a.ports_eq(b)
        && a.service_type == b.service_type
        && a.labels == b.labels
        && a.pod_ip == b.pod_ip
        && a.node_name == b.node_name
        && a.container_statuses_eq(b)
        && a.source_ref == b.source_ref
}

impl K8sResource {
    fn owner_refs_eq(&self, other: &Self) -> bool {
        match (&self.owner_refs, &other.owner_refs) {
            (None, None) => true,
            (Some(a), Some(b)) => {
                if a.len() != b.len() {
                    return false;
                }
                a.iter()
                    .zip(b.iter())
                    .all(|(x, y)| x.kind == y.kind && x.name == y.name && x.uid == y.uid)
            }
            _ => false,
        }
    }
    fn replicas_eq(&self, other: &Self) -> bool {
        match (&self.replicas, &other.replicas) {
            (None, None) => true,
            (Some(a), Some(b)) => {
                a.desired == b.desired && a.ready == b.ready && a.available == b.available
            }
            _ => false,
        }
    }
    fn ports_eq(&self, other: &Self) -> bool {
        match (&self.ports, &other.ports) {
            (None, None) => true,
            (Some(a), Some(b)) => {
                if a.len() != b.len() {
                    return false;
                }
                a.iter().zip(b.iter()).all(|(x, y)| {
                    x.port == y.port
                        && x.target_port == y.target_port
                        && x.protocol == y.protocol
                        && x.node_port == y.node_port
                })
            }
            _ => false,
        }
    }
    fn container_statuses_eq(&self, other: &Self) -> bool {
        match (&self.container_statuses, &other.container_statuses) {
            (None, None) => true,
            (Some(a), Some(b)) => {
                if a.len() != b.len() {
                    return false;
                }
                a.iter().zip(b.iter()).all(|(x, y)| {
                    x.name == y.name
                        && x.ready == y.ready
                        && x.restart_count == y.restart_count
                        && x.state == y.state
                })
            }
            _ => false,
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Tauri commands
// ─────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_cluster_snapshot(
    app: AppHandle,
    cluster_state: State<'_, AppClusterState>,
    mission_state: State<'_, AppMissionState>,
    spec: Option<ClusterViewSpec>,
) -> Result<ClusterSnapshot, String> {
    // Fast path: if a watcher has produced a snapshot, return it.
    {
        let guard = cluster_state.inner.lock().await;
        if guard.handle.is_some() {
            if let Some(snap) = &guard.snapshot {
                return Ok(snap.clone());
            }
            // Watcher running but nothing emitted yet - fall through to inline
            // poll so the UI gets a frame immediately.
        }
    }

    // Inline poll: figure out a container to target. Use the active mission's
    // chapter if available, otherwise return an empty snapshot.
    let Some(chapter_id) = active_chapter_id(&mission_state).await else {
        return Ok(ClusterSnapshot::empty());
    };

    let spec = spec.unwrap_or_default();
    let docker = connect().await.map_err(|e| format!("docker connect: {e:#}"))?;
    let cname = container_name(&chapter_id);
    let resources = poll_once(&docker, &cname, &spec)
        .await
        .map_err(|e| format!("inline poll: {e:#}"))?;

    let snapshot = ClusterSnapshot {
        resources,
        version: 0,
        sampled_at: chrono::Utc::now().to_rfc3339(),
    };

    // Don't cache the inline snapshot - the watcher is the source of truth
    // when one is running. Avoid clobbering a real snapshot with a one-off.
    {
        let mut guard = cluster_state.inner.lock().await;
        if guard.handle.is_none() && guard.snapshot.is_none() {
            guard.snapshot = Some(snapshot.clone());
        }
    }
    let _ = app; // reserved for future (e.g. emit on inline poll)
    Ok(snapshot)
}

#[derive(Debug, Serialize)]
pub struct DescribeResponse {
    pub text: String,
}

#[tauri::command]
pub async fn describe_resource(
    cluster_state: State<'_, AppClusterState>,
    mission_state: State<'_, AppMissionState>,
    uid: String,
) -> Result<DescribeResponse, String> {
    // Look up the resource in the cached snapshot.
    let resource = {
        let guard = cluster_state.inner.lock().await;
        guard
            .snapshot
            .as_ref()
            .and_then(|s| s.resources.get(&uid).cloned())
            .ok_or_else(|| format!("unknown uid {} (no cached snapshot)", uid))?
    };

    // Find the container to exec into.
    let chapter_id = active_chapter_id(&mission_state)
        .await
        .ok_or_else(|| "no active mission".to_string())?;
    let cname = container_name(&chapter_id);
    let docker = connect().await.map_err(|e| format!("docker connect: {e:#}"))?;

    let target = format!("{}/{}", resource.kind.kubectl_name(), resource.name);
    let mut cmd = vec!["kubectl".to_string(), "describe".to_string(), target];
    if resource.kind.is_namespaced() {
        if let Some(ns) = &resource.namespace {
            cmd.push("-n".into());
            cmd.push(ns.clone());
        }
    }

    let out = exec_capture_as(&docker, &cname, cmd, Some("dev"))
        .await
        .map_err(|e| format!("kubectl describe: {e:#}"))?;
    if !out.ok() {
        return Err(format!(
            "kubectl describe exited {} - {}",
            out.exit_code,
            out.stderr.trim()
        ));
    }
    Ok(DescribeResponse { text: out.stdout })
}

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn pod(uid: &str, name: &str, status: &str) -> K8sResource {
        K8sResource {
            kind: K8sKind::Pod,
            uid: uid.into(),
            name: name.into(),
            namespace: Some("default".into()),
            status: Some(status.into()),
            owner_refs: None,
            replicas: None,
            selector: None,
            ports: None,
            service_type: None,
            labels: None,
            pod_ip: None,
            node_name: None,
            container_statuses: None,
            source_ref: None,
            age_seconds: Some(10),
        }
    }

    #[test]
    fn diff_detects_added_resource() {
        let prev = HashMap::new();
        let mut next = HashMap::new();
        next.insert("u1".into(), pod("u1", "web-1", "Running"));
        assert!(snapshots_differ(&prev, &next));
    }

    #[test]
    fn diff_detects_removed_resource() {
        let mut prev = HashMap::new();
        prev.insert("u1".into(), pod("u1", "web-1", "Running"));
        let next = HashMap::new();
        assert!(snapshots_differ(&prev, &next));
    }

    #[test]
    fn diff_detects_status_change() {
        let mut prev = HashMap::new();
        prev.insert("u1".into(), pod("u1", "web-1", "Pending"));
        let mut next = HashMap::new();
        next.insert("u1".into(), pod("u1", "web-1", "Running"));
        assert!(snapshots_differ(&prev, &next));
    }

    #[test]
    fn diff_ignores_age_only_change() {
        let mut prev = HashMap::new();
        prev.insert("u1".into(), pod("u1", "web-1", "Running"));
        let mut next_pod = pod("u1", "web-1", "Running");
        next_pod.age_seconds = Some(9999);
        let mut next = HashMap::new();
        next.insert("u1".into(), next_pod);
        assert!(!snapshots_differ(&prev, &next));
    }

    #[test]
    fn diff_detects_replica_change() {
        let mut a = pod("u1", "web-deploy", "Ready");
        a.kind = K8sKind::Deployment;
        a.replicas = Some(ReplicaCounts {
            desired: 3,
            ready: 3,
            available: 3,
        });
        let mut b = a.clone();
        b.replicas = Some(ReplicaCounts {
            desired: 3,
            ready: 2,
            available: 2,
        });
        let mut prev = HashMap::new();
        prev.insert("u1".into(), a);
        let mut next = HashMap::new();
        next.insert("u1".into(), b);
        assert!(snapshots_differ(&prev, &next));
    }

    #[test]
    fn diff_detects_container_status_change() {
        let mut a = pod("u1", "web-1", "Running");
        a.container_statuses = Some(vec![ContainerStatus {
            name: "main".into(),
            ready: true,
            restart_count: 0,
            state: "running".into(),
        }]);
        let mut b = a.clone();
        b.container_statuses = Some(vec![ContainerStatus {
            name: "main".into(),
            ready: false,
            restart_count: 1,
            state: "waiting:CrashLoopBackOff".into(),
        }]);
        let mut prev = HashMap::new();
        prev.insert("u1".into(), a);
        let mut next = HashMap::new();
        next.insert("u1".into(), b);
        assert!(snapshots_differ(&prev, &next));
    }

    #[test]
    fn spec_defaults() {
        let s = ClusterViewSpec::default();
        let kinds = s.effective_kinds();
        assert!(kinds.contains(&K8sKind::Deployment));
        assert!(kinds.contains(&K8sKind::Pod));
        // Default 2s.
        assert_eq!(s.effective_interval(), Duration::from_millis(2000));
    }

    #[test]
    fn spec_floors_poll_interval() {
        let s = ClusterViewSpec {
            poll_interval_ms: Some(50),
            ..Default::default()
        };
        // Floor of 500ms.
        assert_eq!(s.effective_interval(), Duration::from_millis(500));
    }

    #[test]
    fn pod_status_prefers_terminating() {
        let cs = vec![ContainerStatus {
            name: "c".into(),
            ready: true,
            restart_count: 0,
            state: "running".into(),
        }];
        let st = pod_status(None, Some(&cs), true);
        assert_eq!(st, "Terminating");
    }

    #[test]
    fn pod_status_detects_crashloop() {
        let cs = vec![ContainerStatus {
            name: "c".into(),
            ready: false,
            restart_count: 5,
            state: "waiting:CrashLoopBackOff".into(),
        }];
        let st = pod_status(None, Some(&cs), false);
        assert_eq!(st, "CrashLoopBackOff");
    }

    #[test]
    fn normalize_pod_running() {
        let now = chrono::Utc::now();
        let item = serde_json::json!({
            "metadata": {
                "uid": "abc",
                "name": "web-1",
                "namespace": "default",
                "creationTimestamp": (now - chrono::Duration::seconds(15)).to_rfc3339(),
                "labels": { "app": "web" }
            },
            "spec": { "nodeName": "node-1" },
            "status": {
                "phase": "Running",
                "podIP": "10.0.0.5",
                "containerStatuses": [
                    { "name": "main", "ready": true, "restartCount": 0,
                      "state": { "running": { "startedAt": "2026-01-01T00:00:00Z" } } }
                ]
            }
        });
        let r = normalize_item(K8sKind::Pod, &item, now).expect("normalized");
        assert_eq!(r.uid, "abc");
        assert_eq!(r.name, "web-1");
        assert_eq!(r.status.as_deref(), Some("Running"));
        assert_eq!(r.pod_ip.as_deref(), Some("10.0.0.5"));
        assert_eq!(r.node_name.as_deref(), Some("node-1"));
        assert!(r.age_seconds.unwrap_or(0) >= 14);
        let cs = r.container_statuses.expect("container statuses");
        assert_eq!(cs[0].state, "running");
    }

    #[test]
    fn normalize_deployment_ready() {
        let now = chrono::Utc::now();
        let item = serde_json::json!({
            "metadata": { "uid": "d1", "name": "web", "namespace": "default" },
            "spec": { "replicas": 3 },
            "status": { "readyReplicas": 3, "availableReplicas": 3 }
        });
        let r = normalize_item(K8sKind::Deployment, &item, now).unwrap();
        let rep = r.replicas.unwrap();
        assert_eq!(rep.desired, 3);
        assert_eq!(rep.ready, 3);
        assert_eq!(r.status.as_deref(), Some("Ready"));
    }

    #[test]
    fn cluster_view_spec_parses_snake_case_yaml() {
        let yaml = r#"
watch_namespace: cosmos
watch_kinds: [deployment, replicaset, pod, service, configmap]
poll_interval_ms: 1500
"#;
        let s: ClusterViewSpec = serde_yaml::from_str(yaml).expect("parse yaml");
        assert_eq!(s.watch_namespace.as_deref(), Some("cosmos"));
        assert_eq!(s.poll_interval_ms, Some(1500));
        let kinds = s.watch_kinds.expect("kinds");
        assert_eq!(kinds.len(), 5);
        assert_eq!(kinds[0], K8sKind::Deployment);
        assert_eq!(kinds[2], K8sKind::Pod);
    }

    #[test]
    fn cluster_view_spec_serializes_camel_case_for_ipc() {
        let s = ClusterViewSpec {
            watch_namespace: Some("cosmos".into()),
            watch_kinds: Some(vec![K8sKind::Pod]),
            poll_interval_ms: Some(2000),
        };
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("\"watchNamespace\":\"cosmos\""), "{json}");
        assert!(json.contains("\"watchKinds\":[\"pod\"]"), "{json}");
        assert!(json.contains("\"pollIntervalMs\":2000"), "{json}");
    }

    #[test]
    fn normalize_deployment_not_ready() {
        let now = chrono::Utc::now();
        let item = serde_json::json!({
            "metadata": { "uid": "d1", "name": "web", "namespace": "default" },
            "spec": { "replicas": 3 },
            "status": { "readyReplicas": 1, "availableReplicas": 1 }
        });
        let r = normalize_item(K8sKind::Deployment, &item, now).unwrap();
        assert_eq!(r.status.as_deref(), Some("NotReady"));
    }
}
