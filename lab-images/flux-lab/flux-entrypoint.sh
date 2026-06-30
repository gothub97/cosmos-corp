#!/usr/bin/env bash
# cosmos/flux-lab entrypoint.
#
# Fork of cosmos/k8s-lab's cosmos-k8s-entry.sh. Boots a single-node k3s cluster,
# waits for the API + node, hands the player (uid 1000) a usable ~/.kube/config -
# all VERBATIM from k8s-lab - THEN brings up the two pieces Chapter 4 needs:
#   1. an in-cluster git server (namespace git-system) serving the bare repo over
#      dumb-HTTP so Flux's source-controller can clone it;
#   2. Flux itself (source-controller + kustomize-controller only).
#
# Finally `exec sleep infinity` so the orchestrator can attach with `docker exec`.
#
# Idempotent on container restart: namespaces / installs that already exist must
# not hard-fail. We use `kubectl apply`, guard the flux install behind a health
# check, and `|| true` the genuinely-best-effort steps.
#
# k3s output → /var/log/k3s.log, flux output → /var/log/flux.log, so a plain
# `docker logs` only shows the boot summary, not hundreds of lines of spam.

set -euo pipefail

LOG=/var/log/k3s.log
FLUX_LOG=/var/log/flux.log
KUBECONFIG_SRC=/etc/rancher/k3s/k3s.yaml
KUBECONFIG_DST=/home/dev/.kube/config
GIT_SERVER_MANIFEST=/opt/cosmos/git-server.yaml
TIMEOUT_SECS=120
# Flux + git-server pull container images on first launch - give them room.
ROLLOUT_TIMEOUT=240s

mkdir -p "$(dirname "$LOG")" "$(dirname "$KUBECONFIG_DST")"
: > "$LOG"
: > "$FLUX_LOG"

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
  echo "[cosmos-flux] cgroup v2 detected - relocating PIDs and enabling subtree controllers..."
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

echo "[cosmos-flux] starting k3s server (logging to $LOG)..."

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
    echo "[cosmos-flux] stopping k3s (pid $K3S_PID)..."
    kill "$K3S_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Wait for the API to come up. Two-stage:
#   1. The kubeconfig file has to land on disk (k3s writes it once the API
#      server is listening).
#   2. The single k3s node has to register and report Ready.
echo "[cosmos-flux] waiting up to ${TIMEOUT_SECS}s for the API + node to become ready..."
ready=false

# Stage 1: kubeconfig file exists.
for _ in $(seq 1 "$TIMEOUT_SECS"); do
  [ -s "$KUBECONFIG_SRC" ] && break
  if ! kill -0 "$K3S_PID" 2>/dev/null; then
    echo "[cosmos-flux] FATAL: k3s exited before writing kubeconfig. Last 40 log lines:" >&2
    tail -n 40 "$LOG" >&2 || true
    exit 1
  fi
  sleep 1
done

# Stage 2: a node reports Ready.
for _ in $(seq 1 "$TIMEOUT_SECS"); do
  if KUBECONFIG="$KUBECONFIG_SRC" kubectl get nodes --no-headers 2>/dev/null \
       | awk '{print $2}' \
       | grep -qx 'Ready'; then
    ready=true
    break
  fi
  if ! kill -0 "$K3S_PID" 2>/dev/null; then
    echo "[cosmos-flux] FATAL: k3s exited during node registration. Last 40 log lines:" >&2
    tail -n 40 "$LOG" >&2 || true
    exit 1
  fi
  sleep 1
done

if [ "$ready" != "true" ]; then
  echo "[cosmos-flux] FATAL: API did not become ready in ${TIMEOUT_SECS}s." >&2
  echo "[cosmos-flux] Last 40 log lines:" >&2
  tail -n 40 "$LOG" >&2 || true
  exit 1
fi

# Copy kubeconfig into dev's home and patch the server URL to in-container
# loopback. (Same as k8s-lab.)
cp "$KUBECONFIG_SRC" "$KUBECONFIG_DST"
chown dev:dev "$KUBECONFIG_DST"
chmod 0600 "$KUBECONFIG_DST"
sed -i 's|server:.*|server: https://127.0.0.1:6443|' "$KUBECONFIG_DST"

# Root-side commands below use the cluster-internal kubeconfig directly.
export KUBECONFIG="$KUBECONFIG_SRC"

echo "[cosmos-flux] cluster is ready. dev kubeconfig at $KUBECONFIG_DST."
KUBECONFIG="$KUBECONFIG_SRC" kubectl get nodes -o wide || true

# ── git-server: smart-HTTP apache on the node, exposed into the cluster ───────
# Flux's source-controller (go-git) only speaks SMART HTTP, so we run apache +
# git-http-backend as a host process here on the node (:8080), then point an
# in-cluster Service/Endpoints at the node IP. No image pull, fully offline.
echo "[cosmos-flux] starting smart-HTTP git server (apache git-http-backend on :8080)..."
# /run is a fresh tmpfs in this container, so apache's runtime + lock dirs
# (/var/run/apache2 and /var/lock→/run/lock) don't exist yet - create them or
# apache2ctl dies in mktemp. /var/log/apache2 exists from the package but
# ensure it too for safety.
mkdir -p /run/lock /var/lock/apache2 /var/run/apache2 /var/log/apache2 2>/dev/null || true
# apache2ctl sources /etc/apache2/envvars and daemonizes. On a container restart
# it may already be running - tolerate the resulting non-zero "already running".
apache2ctl start >>"$FLUX_LOG" 2>&1 || true

# Health-check the SMART endpoint (info/refs with the service query param). A
# dumb static server would 200 the file path but NOT this smart handshake.
gitok=false
for _ in $(seq 1 30); do
  if curl -fs "http://127.0.0.1:8080/cosmos-deploy.git/info/refs?service=git-upload-pack" >/dev/null 2>&1; then
    gitok=true
    break
  fi
  sleep 1
done
if [ "$gitok" = true ]; then
  echo "[cosmos-flux] git smart-HTTP server is up on :8080."
else
  echo "[cosmos-flux] WARN: git smart-HTTP health check failed; source-controller clones may fail." >&2
  tail -n 20 /var/log/apache2/error.log >&2 2>/dev/null || true
fi

# Expose it to the cluster: substitute the node InternalIP into the
# Service/Endpoints manifest and apply. Idempotent across restarts.
NODE_IP="$(KUBECONFIG="$KUBECONFIG_SRC" kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null)"
echo "[cosmos-flux] wiring git-server Service/Endpoints → ${NODE_IP}:8080 ..."
if [ -z "$NODE_IP" ]; then
  echo "[cosmos-flux] FATAL: could not determine node InternalIP for git-server Endpoints." >&2
  exit 1
fi
sed "s/__NODE_IP__/${NODE_IP}/g" "$GIT_SERVER_MANIFEST" | kubectl apply -f - >>"$FLUX_LOG" 2>&1 || {
  echo "[cosmos-flux] FATAL: failed to apply git-server Service/Endpoints. See $FLUX_LOG." >&2
  tail -n 40 "$FLUX_LOG" >&2 || true
  exit 1
}

# ── Flux: install only the two controllers Chapter 4 needs ───────────────────
# Guard the (slow, image-pulling) install behind a health check so container
# restarts are fast and don't re-pull. `flux check` returns non-zero if the
# controllers aren't installed/healthy.
echo "[cosmos-flux] checking for an existing healthy Flux install..."
if flux check >>"$FLUX_LOG" 2>&1; then
  echo "[cosmos-flux] Flux already installed and healthy - skipping install."
else
  echo "[cosmos-flux] installing Flux (source-controller + kustomize-controller; pulls images on first run)..."
  # --network-policy=false keeps things simple for a single-node lab; the
  # controllers don't need the default deny-all egress rules here.
  if ! flux install \
        --components=source-controller,kustomize-controller \
        --network-policy=false \
        --timeout="$ROLLOUT_TIMEOUT" >>"$FLUX_LOG" 2>&1; then
    echo "[cosmos-flux] WARN: 'flux install' returned non-zero (often a slow first-run image pull)." >&2
    echo "[cosmos-flux] Will still wait on the controller rollouts below." >&2
  fi
fi

echo "[cosmos-flux] waiting for Flux controllers to roll out..."
for _deploy in source-controller kustomize-controller; do
  if ! kubectl -n flux-system rollout status "deploy/$_deploy" --timeout="$ROLLOUT_TIMEOUT" >>"$FLUX_LOG" 2>&1; then
    echo "[cosmos-flux] WARN: $_deploy not Available within $ROLLOUT_TIMEOUT. Last 20 flux-log lines:" >&2
    tail -n 20 "$FLUX_LOG" >&2 || true
  fi
done

echo "[cosmos-flux] flux is ready"

# Hand off to a long-lived no-op so the container stays up. The orchestrator
# runs every player shell via `docker exec -u dev`, so PID 1 just needs to
# stay alive.
echo "[cosmos-flux] handing off to sleep - orchestrator will exec into this container."
exec sleep infinity
