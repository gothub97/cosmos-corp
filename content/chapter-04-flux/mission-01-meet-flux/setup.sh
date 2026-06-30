#!/usr/bin/env bash
# Mission 04.01 setup - recon only, no Flux objects created. We just clear the
# markers and make sure the cluster + Flux controllers (brought up by the lab
# image's entrypoint) are actually reachable before the player starts poking.
# Idempotent.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/ran_flux_check \
      /tmp/.cosmos/listed_flux_system \
      /tmp/.cosmos/saw_flux_all

export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"

# Wait up to 120s for the API. The entrypoint already waited once at boot, but
# a freshly-recreated container goes through it again here.
for _ in $(seq 1 120); do
  if kubectl get nodes >/dev/null 2>&1; then break; fi
  sleep 1
done

# Wait for the two Flux controllers to report at least one available replica.
# They pull images on first launch, so give them generous headroom.
for _ in $(seq 1 180); do
  sc=$(kubectl -n flux-system get deploy source-controller \
        -o jsonpath='{.status.availableReplicas}' 2>/dev/null || true)
  kc=$(kubectl -n flux-system get deploy kustomize-controller \
        -o jsonpath='{.status.availableReplicas}' 2>/dev/null || true)
  if [ "${sc:-0}" -ge 1 ] 2>/dev/null && [ "${kc:-0}" -ge 1 ] 2>/dev/null; then
    break
  fi
  sleep 1
done

cd "$HOME"
exit 0
