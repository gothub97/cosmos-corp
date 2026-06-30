#!/usr/bin/env bash
# Mission 04.02 validator - runs every 2s.
#   created_source  → REAL state: GitRepository `cosmos-deploy` exists in default.
#   source_ready    → REAL state: its Ready condition is True.
#   listed_sources  → history grep (`flux get sources git` is read-only).

set +e

HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# created_source - the GitRepository object exists in the default namespace.
if ! done_q created_source; then
  if kubectl -n default get gitrepository cosmos-deploy >/dev/null 2>&1; then
    mark created_source
  fi
fi

# source_ready - the GitRepository's Ready condition reports True.
if ! done_q source_ready; then
  status=$(kubectl -n default get gitrepository cosmos-deploy \
            -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
  if [ "$status" = "True" ]; then
    mark source_ready
  fi
fi

# listed_sources - history grep for `flux get sources git` (any flags / scope).
if ! done_q listed_sources; then
  grep -Eq '(^|[[:space:];|&(`])flux[[:space:]]+(-[^[:space:]]+[[:space:]]+)*get([[:space:]]+(-[^[:space:]]+|--?[a-zA-Z][^[:space:]]*))*[[:space:]]+sources([[:space:]]+(-[^[:space:]]+|--?[a-zA-Z][^[:space:]]*))*[[:space:]]+git([[:space:]]|$)' \
       "$HIST" 2>/dev/null \
    && mark listed_sources
fi

exit 0
