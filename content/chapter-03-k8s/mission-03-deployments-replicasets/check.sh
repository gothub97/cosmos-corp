#!/usr/bin/env bash
# Mission 03.03 validator - runs every 2s.
# created_deployment + scaled_to_3 use real cluster state. listed_deploy_rs is
# a read-only `kubectl get` so we use bash-history grep.

set +e

HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# created_deployment - Deployment `web` exists in the default namespace.
if ! done_q created_deployment; then
  if kubectl get deploy/web >/dev/null 2>&1; then
    mark created_deployment
  fi
fi

# listed_deploy_rs - bash history shows a `kubectl get` aimed at deployments
# OR replicasets. Accept short forms (`deploy`, `rs`) and comma-separated lists
# (`kubectl get deploy,rs,pods`).
if ! done_q listed_deploy_rs; then
  grep -Eq '(^|[[:space:];|&(`])kubectl[[:space:]]+(-[^[:space:]]+[[:space:]]+)*get([[:space:]]+(-[^[:space:]]+|--?[a-zA-Z][^[:space:]]*))*[[:space:]]+[^[:space:]]*\<(deployments?|deploy|replicasets?|rs)\>' \
       "$HIST" 2>/dev/null \
    && mark listed_deploy_rs
fi

# scaled_to_3 - readyReplicas on deploy/web reports 3.
if ! done_q scaled_to_3; then
  ready=$(kubectl get deploy/web -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
  if [ "$ready" = "3" ]; then
    mark scaled_to_3
  fi
fi

exit 0
