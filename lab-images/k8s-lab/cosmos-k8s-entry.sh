#!/usr/bin/env bash
# cosmos/k8s-lab entrypoint.
#
# Boots a single-node k3s cluster in the background, waits up to 60s for the
# API to come up, hands the player (uid 1000) a usable ~/.kube/config, then
# `exec sleep infinity` so the orchestrator can attach with `docker exec`.
#
# All output goes to /var/log/k3s.log so a `docker logs cosmos-ch03` only
# shows the boot summary, not 200 lines of k3s spam.

set -euo pipefail

LOG=/var/log/k3s.log
KUBECONFIG_SRC=/etc/rancher/k3s/k3s.yaml
KUBECONFIG_DST=/home/dev/.kube/config
TIMEOUT_SECS=120

mkdir -p "$(dirname "$LOG")" "$(dirname "$KUBECONFIG_DST")"
: > "$LOG"

# ── cgroup v2 nested-container fix ───────────────────────────────────────────
# Modern Docker hosts (incl. Docker Desktop on macOS) expose cgroup v2 to the
# container, but the root cgroup ends up in "domain" mode with all controllers
# attached at the root level - a state that *forbids* kubelet from creating
# `/sys/fs/cgroup/kubepods` as a child. The fix is to:
#   1. Move every existing process out of the root cgroup into a leaf scope
#      (`init.scope`). cgroup v2 requires the "no internal processes" rule:
#      a cgroup may have either child cgroups OR processes, never both.
#   2. Enable every available controller in the root's `subtree_control` so
#      descendants (kubepods, pod cgroups) can use them.
#
# This is the same workaround `rancher/k3s` and `k3d` apply for nested k3s.
# Skipped silently on cgroup v1 hosts.
if [ -f /sys/fs/cgroup/cgroup.controllers ]; then
  echo "[cosmos-k8s] cgroup v2 detected - relocating PIDs and enabling subtree controllers..."
  mkdir -p /sys/fs/cgroup/init.scope
  if [ -f /sys/fs/cgroup/cgroup.procs ]; then
    while read -r _pid; do
      [ -n "$_pid" ] || continue
      echo "$_pid" > /sys/fs/cgroup/init.scope/cgroup.procs 2>/dev/null || true
    done < /sys/fs/cgroup/cgroup.procs
  fi
  for _ctrl in $(cat /sys/fs/cgroup/cgroup.controllers); do
    echo "+$_ctrl" > /sys/fs/cgroup/cgroup.subtree_control 2>/dev/null || true
  done
fi

# Best-effort: make the root mount rshared so kubelet can manage bind mounts
# under it. Failures here are non-fatal - they only matter for some volume
# plugins we don't use in the missions.
mount --make-rshared / 2>/dev/null || true

echo "[cosmos-k8s] starting k3s server (logging to $LOG)..."

# --disable=traefik           - we don't need an ingress controller for missions
# --disable=servicelb         - ditto for klipper-lb
# --disable=metrics-server    - saves ~200MB RAM; missions don't `top` pods
# --write-kubeconfig-mode=644 - so non-root can read it before we copy it across
# --snapshotter=native        - Docker Desktop's nested filesystem doesn't
#                              support stacking another overlayfs on top, so
#                              kubelet/containerd would refuse to start with
#                              the default. `native` is slower (no CoW) but
#                              works inside any container runtime.
k3s server \
    --disable=traefik \
    --disable=servicelb \
    --disable=metrics-server \
    --write-kubeconfig-mode=644 \
    --snapshotter=native \
    >>"$LOG" 2>&1 &
K3S_PID=$!

cleanup() {
  if kill -0 "$K3S_PID" 2>/dev/null; then
    echo "[cosmos-k8s] stopping k3s (pid $K3S_PID)..."
    kill "$K3S_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Wait for the API to come up. Two-stage:
#   1. The kubeconfig file has to land on disk (k3s writes it once the API
#      server is listening).
#   2. The single k3s node has to register and report Ready (kubelet has to
#      come up, finish its first node sync, and pass health checks).
echo "[cosmos-k8s] waiting up to ${TIMEOUT_SECS}s for the API + node to become ready..."
ready=false

# Stage 1: kubeconfig file exists.
for _ in $(seq 1 "$TIMEOUT_SECS"); do
  [ -s "$KUBECONFIG_SRC" ] && break
  if ! kill -0 "$K3S_PID" 2>/dev/null; then
    echo "[cosmos-k8s] FATAL: k3s exited before writing kubeconfig. Last 40 log lines:" >&2
    tail -n 40 "$LOG" >&2 || true
    exit 1
  fi
  sleep 1
done

# Stage 2: a node reports Ready. Use the `Ready` column from
# `kubectl get nodes --no-headers` rather than a jsonpath - equivalent
# semantics, far simpler to reason about, and easier to debug.
for _ in $(seq 1 "$TIMEOUT_SECS"); do
  if KUBECONFIG="$KUBECONFIG_SRC" kubectl get nodes --no-headers 2>/dev/null \
       | awk '{print $2}' \
       | grep -qx 'Ready'; then
    ready=true
    break
  fi
  if ! kill -0 "$K3S_PID" 2>/dev/null; then
    echo "[cosmos-k8s] FATAL: k3s exited during node registration. Last 40 log lines:" >&2
    tail -n 40 "$LOG" >&2 || true
    exit 1
  fi
  sleep 1
done

if [ "$ready" != "true" ]; then
  echo "[cosmos-k8s] FATAL: API did not become ready in ${TIMEOUT_SECS}s." >&2
  echo "[cosmos-k8s] Last 40 log lines:" >&2
  tail -n 40 "$LOG" >&2 || true
  exit 1
fi

# Copy kubeconfig into dev's home and chown so the player can read it without
# sudo. Patch the server URL to the in-container loopback (`docker exec` from
# the host doesn't go through 0.0.0.0, but `kubectl` from inside this container
# absolutely does loop through 127.0.0.1).
cp "$KUBECONFIG_SRC" "$KUBECONFIG_DST"
chown dev:dev "$KUBECONFIG_DST"
chmod 0600 "$KUBECONFIG_DST"
sed -i 's|server:.*|server: https://127.0.0.1:6443|' "$KUBECONFIG_DST"

echo "[cosmos-k8s] cluster is ready. dev kubeconfig at $KUBECONFIG_DST."
echo "[cosmos-k8s] node list:"
KUBECONFIG="$KUBECONFIG_SRC" kubectl get nodes -o wide || true

# Hand off to a long-lived no-op so the container stays up. The orchestrator
# runs every player shell via `docker exec -u dev`, so PID 1 just needs to
# stay alive.
echo "[cosmos-k8s] handing off to sleep - orchestrator will exec into this container."
exec sleep infinity
