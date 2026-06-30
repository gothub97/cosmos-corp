// Docker lifecycle for Cosmos Corp.
//
// Each chapter gets one long-lived container named `cosmos-{chapter_id}`
// (e.g. `cosmos-ch01`). The container runs `sleep infinity` so it stays
// alive across missions; we attach via `docker exec` for the PTY and the
// validator. `reset_chapter` simply nukes and recreates it.

use std::collections::HashMap;

use anyhow::{anyhow, Context, Result};
use bollard::container::{
    Config, CreateContainerOptions, ListContainersOptions, LogOutput,
    RemoveContainerOptions, StartContainerOptions,
};
use bollard::exec::{CreateExecOptions, StartExecOptions, StartExecResults};
use bollard::Docker;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

/// Result of a non-interactive `exec`. Used by the validator and by setup.sh.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i64,
}

impl ExecOutput {
    pub fn ok(&self) -> bool {
        self.exit_code == 0
    }
}

/// Health-check report sent to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerHealthReport {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// Resolve the canonical container name for a chapter.
pub fn container_name(chapter_id: &str) -> String {
    format!("cosmos-{}", chapter_id)
}

/// Some chapter images need extra Linux capabilities. Currently only the
/// Kubernetes lab (and, in the future, the Flux lab) runs k3s as PID 1, which
/// requires `--privileged`. Chapter 1 (terminal-base) and Chapter 2 (git-lab)
/// must NOT receive privileged mode - defence in depth.
///
/// Matched against the lab image string. Both the chapter-id naming
/// (`cosmos/k8s-lab`) and the legacy `cosmos-k8s-lab` tag forms are accepted.
pub fn requires_privileged(image: &str) -> bool {
    image.contains("k8s-lab") || image.contains("flux-lab")
}

/// Whether to let the lab image's own ENTRYPOINT/CMD run instead of overriding
/// it with `sleep infinity`. The k8s-lab and flux-lab images launch k3s in
/// their entrypoint and need that to keep running; ch01/ch02 just want a long
/// sleep so we can attach via `docker exec`.
pub fn uses_image_entrypoint(image: &str) -> bool {
    image.contains("k8s-lab") || image.contains("flux-lab")
}

/// User to pass via `docker exec -u <user>` when attaching the player's PTY.
/// `None` means use the image's default USER (correct for ch01/ch02 where
/// the image already declares `USER dev`).
///
/// For k8s-lab / flux-lab the image runs as root in PID 1 (k3s needs that to
/// manage cgroups + iptables + containerd), but the player's workflow lives
/// under `/home/dev`: kubeconfig is at `/home/dev/.kube/config`, bash history
/// is `/home/dev/.bash_history`, and check.sh history-grep validators expect
/// `HOME=/home/dev`. Force `-u dev` for those images.
pub fn pty_user_for_image(image: &str) -> Option<&'static str> {
    if image.contains("k8s-lab") || image.contains("flux-lab") {
        Some("dev")
    } else {
        None
    }
}

/// Connect to the local Docker daemon (unix socket / named pipe / DOCKER_HOST).
pub async fn connect() -> Result<Docker> {
    Docker::connect_with_local_defaults().context("connecting to docker")
}

/// Tauri command - surfaced to the frontend. Never panics: a missing or
/// stopped daemon turns into `{ ok: false, reason: "..." }`.
#[tauri::command]
pub async fn docker_health() -> Result<DockerHealthReport, String> {
    Ok(check_docker_health().await)
}

/// Internal: same as the IPC command, but returns the report directly so
/// other modules can consume it without going through the IPC boundary.
pub async fn check_docker_health() -> DockerHealthReport {
    match connect().await {
        Ok(docker) => match docker.version().await {
            Ok(version) => {
                info!(
                    api = ?version.api_version,
                    server = ?version.version,
                    "docker daemon reachable"
                );
                DockerHealthReport { ok: true, reason: None }
            }
            Err(e) => {
                warn!(error = %e, "docker daemon unreachable");
                DockerHealthReport {
                    ok: false,
                    reason: Some(format!(
                        "Docker is installed but the daemon isn't responding ({e}). \
                         Make sure Docker Desktop or Colima is running."
                    )),
                }
            }
        },
        Err(e) => {
            warn!(error = %e, "docker connect failed");
            DockerHealthReport {
                ok: false,
                reason: Some(format!(
                    "Couldn't connect to Docker ({e}). Install Docker Desktop or Colima \
                     and start it before launching Cosmos Corp."
                )),
            }
        }
    }
}

/// Look up a container by exact name. Returns `Ok(None)` if it doesn't exist.
async fn find_container_by_name(
    docker: &Docker,
    name: &str,
) -> Result<Option<bollard::secret::ContainerSummary>> {
    let mut filters: HashMap<String, Vec<String>> = HashMap::new();
    // Docker name filters are substring matches; we still must verify exact
    // match below because `cosmos-ch01` would also match `cosmos-ch01-old`.
    filters.insert("name".into(), vec![name.to_string()]);

    let opts = ListContainersOptions::<String> {
        all: true,
        filters,
        ..Default::default()
    };
    let containers = docker.list_containers(Some(opts)).await?;
    for c in containers {
        if let Some(names) = &c.names {
            if names
                .iter()
                .any(|n| n.trim_start_matches('/') == name)
            {
                return Ok(Some(c));
            }
        }
    }
    Ok(None)
}

/// Ensure the chapter container exists and is running, then return its id.
///
/// - Existing + running → returned as-is (warm state across missions)
/// - Existing + stopped → started, then returned
/// - Missing → created from `image`, started, returned
pub async fn ensure_chapter_container(
    docker: &Docker,
    chapter_id: &str,
    image: &str,
) -> Result<String> {
    let name = container_name(chapter_id);

    if let Some(existing) = find_container_by_name(docker, &name).await? {
        let id = existing
            .id
            .clone()
            .ok_or_else(|| anyhow!("container summary missing id"))?;
        let running = existing.state.as_deref() == Some("running");
        if !running {
            info!(name = %name, "starting existing container");
            docker
                .start_container(&id, None::<StartContainerOptions<String>>)
                .await
                .context("start_container")?;
        } else {
            info!(name = %name, "reusing running container");
        }
        return Ok(id);
    }

    info!(name = %name, image = %image, "creating chapter container");
    let create_opts = CreateContainerOptions {
        name: name.clone(),
        platform: None,
    };

    // Only the k8s/flux lab images need --privileged (they run k3s as PID 1).
    // ch01 / ch02 must remain unprivileged.
    //
    // Bollard's `Privileged: true` alone is NOT enough for k3s - the Docker
    // CLI's `--privileged` also flips a few other knobs that kubelet's
    // ContainerManager relies on. Without them, kubelet dies at startup with
    // "cannot enter cgroupv2 /sys/fs/cgroup/kubepods with domain controllers
    // -- it is in an invalid state". To match the CLI's behavior we also set:
    //
    //   * cgroupns_mode = host    - share the host's cgroup namespace so
    //                               kubelet can manipulate /sys/fs/cgroup
    //                               leaf controllers.
    //   * tmpfs /run, /var/run    - containerd / runc need a writable tmpfs
    //                               here for their socket + state dirs.
    //   * security_opt unconfined - the CLI's --privileged disables seccomp
    //                               + AppArmor; bollard doesn't infer this
    //                               from `privileged`, so we set it manually.
    //
    // ch01 / ch02 are not in the privileged list, so they get None here and
    // remain fully sandboxed.
    let host_config = if requires_privileged(image) {
        info!(name = %name, "applying --privileged + cgroupns=host + tmpfs for lab image");
        let mut tmpfs = HashMap::new();
        tmpfs.insert("/run".to_string(), "exec,mode=755".to_string());
        tmpfs.insert("/var/run".to_string(), "exec,mode=755".to_string());
        Some(bollard::secret::HostConfig {
            privileged: Some(true),
            cgroupns_mode: Some(bollard::secret::HostConfigCgroupnsModeEnum::HOST),
            tmpfs: Some(tmpfs),
            security_opt: Some(vec![
                "seccomp=unconfined".to_string(),
                "apparmor=unconfined".to_string(),
            ]),
            ..Default::default()
        })
    } else {
        None
    };

    // For ch01/ch02 we override CMD with `sleep infinity` so the container
    // stays up while we attach via `docker exec`. For the k8s/flux labs the
    // image's own ENTRYPOINT (which launches k3s) does that job - overriding
    // would break the cluster.
    let cmd = if uses_image_entrypoint(image) {
        None
    } else {
        Some(vec!["sleep".to_string(), "infinity".to_string()])
    };

    let config = Config {
        image: Some(image.to_string()),
        cmd,
        tty: Some(true),
        open_stdin: Some(true),
        attach_stdin: Some(false),
        attach_stdout: Some(false),
        attach_stderr: Some(false),
        host_config,
        ..Default::default()
    };
    let created = docker
        .create_container(Some(create_opts), config)
        .await
        .context("create_container")?;
    docker
        .start_container(&created.id, None::<StartContainerOptions<String>>)
        .await
        .context("start_container")?;

    // Make sure the validator's marker directory exists so `test -f` works
    // even before any objective has been completed.
    let _ = exec_capture(
        docker,
        &created.id,
        vec!["mkdir".into(), "-p".into(), "/tmp/.cosmos".into()],
    )
    .await;

    Ok(created.id)
}

/// Destroy the chapter container. Force-removes even if running.
pub async fn destroy_container(docker: &Docker, container_id: &str) -> Result<()> {
    info!(container = %container_id, "removing container");
    let opts = RemoveContainerOptions {
        force: true,
        v: true,
        link: false,
    };
    docker
        .remove_container(container_id, Some(opts))
        .await
        .context("remove_container")?;
    Ok(())
}

/// Run a non-interactive command inside `container_id` and capture its
/// stdout/stderr. Used by the validator and by `setup.sh`.
pub async fn exec_capture(
    docker: &Docker,
    container_id: &str,
    cmd: Vec<String>,
) -> Result<ExecOutput> {
    exec_capture_as(docker, container_id, cmd, None).await
}

/// Like `exec_capture` but runs the command as a specific user inside the
/// container (e.g. "dev"). Useful for kubectl, where KUBECONFIG lives under
/// `/home/dev/.kube` and root would need `--kubeconfig` overrides.
pub async fn exec_capture_as(
    docker: &Docker,
    container_id: &str,
    cmd: Vec<String>,
    user: Option<&str>,
) -> Result<ExecOutput> {
    let exec = docker
        .create_exec(
            container_id,
            CreateExecOptions {
                attach_stdout: Some(true),
                attach_stderr: Some(true),
                tty: Some(false),
                cmd: Some(cmd),
                user: user.map(|s| s.to_string()),
                ..Default::default()
            },
        )
        .await
        .context("create_exec")?;

    let mut stdout = String::new();
    let mut stderr = String::new();

    let started = docker
        .start_exec(
            &exec.id,
            Some(StartExecOptions {
                detach: false,
                tty: false,
                ..Default::default()
            }),
        )
        .await
        .context("start_exec")?;

    if let StartExecResults::Attached { mut output, .. } = started {
        while let Some(chunk) = output.next().await {
            match chunk {
                Ok(LogOutput::StdOut { message }) => {
                    stdout.push_str(&String::from_utf8_lossy(&message));
                }
                Ok(LogOutput::StdErr { message }) => {
                    stderr.push_str(&String::from_utf8_lossy(&message));
                }
                Ok(LogOutput::Console { message }) => {
                    stdout.push_str(&String::from_utf8_lossy(&message));
                }
                Ok(LogOutput::StdIn { .. }) => {}
                Err(e) => {
                    warn!(error = %e, "exec stream error");
                    break;
                }
            }
        }
    }

    let inspect = docker
        .inspect_exec(&exec.id)
        .await
        .context("inspect_exec")?;
    let exit_code = inspect.exit_code.unwrap_or(-1);

    Ok(ExecOutput {
        stdout,
        stderr,
        exit_code,
    })
}

/// Convenience: run `bash -lc "<script>"` inside the container.
pub async fn exec_bash(
    docker: &Docker,
    container_id: &str,
    script: &str,
) -> Result<ExecOutput> {
    exec_capture(
        docker,
        container_id,
        vec!["bash".into(), "-lc".into(), script.into()],
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn privileged_only_for_lab_images() {
        assert!(requires_privileged("cosmos/k8s-lab:latest"));
        assert!(requires_privileged("cosmos/k8s-lab"));
        assert!(requires_privileged("cosmos/flux-lab:dev"));
        assert!(!requires_privileged("cosmos/terminal-base"));
        assert!(!requires_privileged("cosmos/git-lab:latest"));
    }

    #[test]
    fn entrypoint_only_for_lab_images() {
        assert!(uses_image_entrypoint("cosmos/k8s-lab:latest"));
        assert!(uses_image_entrypoint("cosmos/flux-lab"));
        assert!(!uses_image_entrypoint("cosmos/terminal-base"));
        assert!(!uses_image_entrypoint("cosmos/git-lab"));
    }

    #[test]
    fn pty_user_dev_only_for_lab_images() {
        assert_eq!(pty_user_for_image("cosmos/k8s-lab:latest"), Some("dev"));
        assert_eq!(pty_user_for_image("cosmos/flux-lab"), Some("dev"));
        assert_eq!(pty_user_for_image("cosmos/terminal-base"), None);
        assert_eq!(pty_user_for_image("cosmos/git-lab:latest"), None);
    }
}
