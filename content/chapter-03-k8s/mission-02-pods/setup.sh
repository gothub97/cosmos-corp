#!/usr/bin/env bash
# Mission 03.02 setup - make sure no leftover `tinypod` is hanging around so
# the player's `kubectl run tinypod` doesn't trip over an "AlreadyExists" error.
# Idempotent.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/created_pod \
      /tmp/.cosmos/listed_pods \
      /tmp/.cosmos/described_pod \
      /tmp/.cosmos/viewed_logs \
      /tmp/.cosmos/deleted_pod

export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"

# Wait for the API to be available.
for _ in $(seq 1 60); do
  if kubectl get nodes >/dev/null 2>&1; then break; fi
  sleep 1
done

# Clean up any pod the player might have created on a previous attempt. We
# scope by name AND by mission label so the validator never sees stale state.
kubectl delete pod tinypod --ignore-not-found --wait=false >/dev/null 2>&1 || true
kubectl delete pods -l mission=ch03-m02 --ignore-not-found --wait=false >/dev/null 2>&1 || true

cd "$HOME"
exit 0
