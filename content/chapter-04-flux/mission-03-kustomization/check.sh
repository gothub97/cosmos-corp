#!/usr/bin/env bash
# Mission 04.03 validator - runs every 2s. All three objectives are real cluster
# state: the Kustomization object, the Deployment it rolled out, and the
# Kustomization's Ready condition.

set +e

mkdir -p /tmp/.cosmos
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# created_kustomization - the Kustomization object exists in default.
if ! done_q created_kustomization; then
  if kubectl -n default get kustomization cosmos-web >/dev/null 2>&1; then
    mark created_kustomization
  fi
fi

# app_deployed - the cosmos-web Deployment Flux applied has >= 1 available pod.
if ! done_q app_deployed; then
  avail=$(kubectl -n default get deploy cosmos-web \
           -o jsonpath='{.status.availableReplicas}' 2>/dev/null)
  if [ "${avail:-0}" -ge 1 ] 2>/dev/null; then
    mark app_deployed
  fi
fi

# kustomization_ready - the Kustomization's Ready condition reports True.
if ! done_q kustomization_ready; then
  status=$(kubectl -n default get kustomization cosmos-web \
            -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
  if [ "$status" = "True" ]; then
    mark kustomization_ready
  fi
fi

exit 0
