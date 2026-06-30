#!/usr/bin/env bash
# Mission 03.04 setup - make sure the player has a `web` Deployment running
# (so the expose makes sense) and that no leftover services collide. Idempotent.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/exposed_clusterip \
      /tmp/.cosmos/listed_services \
      /tmp/.cosmos/exposed_nodeport

export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"

# Wait for the API.
for _ in $(seq 1 60); do
  if kubectl get nodes >/dev/null 2>&1; then break; fi
  sleep 1
done

# Clean up any prior services the mission creates.
kubectl delete svc/web --ignore-not-found --wait=false >/dev/null 2>&1 || true
kubectl delete svc/web-np --ignore-not-found --wait=false >/dev/null 2>&1 || true
kubectl delete svc -l mission=ch03-m04 --ignore-not-found --wait=false >/dev/null 2>&1 || true

# Make sure the `web` Deployment exists. If it doesn't (player skipped m03 or
# reset state), create it. We DON'T scale it back to 3 - m03 already taught
# that, and 1 replica is enough to demonstrate Service routing.
if ! kubectl get deploy/web >/dev/null 2>&1; then
  kubectl create deployment web --image=nginx:alpine >/dev/null
fi

cd "$HOME"
exit 0
