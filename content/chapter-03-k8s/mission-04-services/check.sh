#!/usr/bin/env bash
# Mission 03.04 validator - runs every 2s.
# Real cluster state for the two `expose` objectives, history grep for the
# read-only `kubectl get svc`.

set +e

HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# exposed_clusterip - Service `web` exists with type=ClusterIP and selects
# pods with label `app=web` (which is the default selector kubectl expose
# generates from a Deployment named `web`).
if ! done_q exposed_clusterip; then
  type=$(kubectl get svc/web -o jsonpath='{.spec.type}' 2>/dev/null)
  selector=$(kubectl get svc/web -o jsonpath='{.spec.selector.app}' 2>/dev/null)
  if [ "$type" = "ClusterIP" ] && [ "$selector" = "web" ]; then
    mark exposed_clusterip
  fi
fi

# listed_services - bash history grep for `kubectl get svc` / `services`.
if ! done_q listed_services; then
  grep -Eq '(^|[[:space:];|&(`])kubectl[[:space:]]+(-[^[:space:]]+[[:space:]]+)*get([[:space:]]+(-[^[:space:]]+|--?[a-zA-Z][^[:space:]]*))*[[:space:]]+[^[:space:]]*\<(svc|services?)\>' \
       "$HIST" 2>/dev/null \
    && mark listed_services
fi

# exposed_nodeport - Service `web-np` exists with type=NodePort.
if ! done_q exposed_nodeport; then
  type=$(kubectl get svc/web-np -o jsonpath='{.spec.type}' 2>/dev/null)
  if [ "$type" = "NodePort" ]; then
    mark exposed_nodeport
  fi
fi

exit 0
