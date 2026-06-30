#!/usr/bin/env bash
# Mission 03.05 setup - clear any leftover ConfigMap / Secret / Pod the player
# might have left behind on a retry. Idempotent.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/created_configmap \
      /tmp/.cosmos/created_secret \
      /tmp/.cosmos/mounted_in_pod

export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"

# Wait for the API.
for _ in $(seq 1 60); do
  if kubectl get nodes >/dev/null 2>&1; then break; fi
  sleep 1
done

# Wipe the things this mission asks the player to create.
kubectl delete configmap/cosmos-config --ignore-not-found --wait=false >/dev/null 2>&1 || true
kubectl delete secret/cosmos-secret --ignore-not-found --wait=false >/dev/null 2>&1 || true
kubectl delete pod/cosmos-app --ignore-not-found --wait=false >/dev/null 2>&1 || true
kubectl delete configmap,secret,pod \
  -l mission=ch03-m05 --ignore-not-found --wait=false >/dev/null 2>&1 || true

cd "$HOME"
exit 0
