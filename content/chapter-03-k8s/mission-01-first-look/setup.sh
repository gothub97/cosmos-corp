#!/usr/bin/env bash
# Mission 03.01 setup - gives the player a clean cluster to poke at. Idempotent.
# The cluster itself is brought up by the lab image's entrypoint; we just wait
# for it and clear marker files so a retry starts fresh.

set -euo pipefail

# Reset markers for THIS mission's objectives.
mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/ran_version \
      /tmp/.cosmos/saw_cluster_info \
      /tmp/.cosmos/listed_nodes

# Make sure kubectl can find the kubeconfig (orchestrator uses dev's env, but
# being explicit helps when this script is invoked from non-interactive bash).
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"

# Wait up to 60s for the cluster to become reachable. The lab entrypoint
# already does this once at boot, but a freshly-recreated container goes
# through it again here.
for _ in $(seq 1 60); do
  if kubectl get nodes >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Tidy up anything a previous attempt left behind (this mission creates
# nothing, but stay parallel with later missions).
kubectl delete deployment,replicaset,pod,service,configmap,secret \
  -l mission=ch03-m01 --ignore-not-found --wait=false >/dev/null 2>&1 || true

cd "$HOME"
exit 0
