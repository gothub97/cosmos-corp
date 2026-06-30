#!/usr/bin/env bash
# Mission 03.03 setup - make sure no leftover `web` Deployment is around.
# Idempotent.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/created_deployment \
      /tmp/.cosmos/listed_deploy_rs \
      /tmp/.cosmos/scaled_to_3

export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"

# Wait for the API.
for _ in $(seq 1 60); do
  if kubectl get nodes >/dev/null 2>&1; then break; fi
  sleep 1
done

# Clean up the player's prior attempt - this mission asks them to create a
# Deployment named `web`, so we yank that and any `mission=ch03-m03` stragglers.
kubectl delete deploy/web --ignore-not-found --wait=false >/dev/null 2>&1 || true
kubectl delete deployment,replicaset,pod,service \
  -l mission=ch03-m03 --ignore-not-found --wait=false >/dev/null 2>&1 || true

# Belt-and-suspenders: also delete any orphan pod named `tinypod` left over
# from mission 02 if the player retried mid-chapter.
kubectl delete pod tinypod --ignore-not-found --wait=false >/dev/null 2>&1 || true

cd "$HOME"
exit 0
