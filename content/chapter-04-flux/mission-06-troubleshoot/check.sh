#!/usr/bin/env bash
# Mission 04.06 validator - runs every 2s.
#   found_failure    → history grep: the player inspected the failure with any of
#                      `flux get kustomizations`, `kubectl describe kustomization`,
#                      or `flux logs`.
#   fixed_and_pushed → REAL state: the BARE repo's main no longer carries the
#                      broken image tag and now uses nginx:alpine (i.e. they
#                      committed AND pushed the fix).
#   healthy_again    → REAL state: the Kustomization is Ready==True AND the
#                      Deployment has at least one available pod.

set +e

HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"
BARE=/srv/repos/cosmos-deploy.git

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# found_failure - any of the three diagnosis commands in history.
if ! done_q found_failure; then
  if grep -Eq '(^|[[:space:];|&(`])flux[[:space:]]+(-[^[:space:]]+[[:space:]]+)*get([[:space:]]+(-[^[:space:]]+|--?[a-zA-Z][^[:space:]]*))*[[:space:]]+kustomizations?([[:space:]]|$)' "$HIST" 2>/dev/null \
     || grep -Eq '(^|[[:space:];|&(`])flux[[:space:]]+(-[^[:space:]]+[[:space:]]+)*logs([[:space:]]|$)' "$HIST" 2>/dev/null \
     || { grep -E '(^|[[:space:];|&(`])kubectl[[:space:]]' "$HIST" 2>/dev/null \
            | grep -E '\<describe\>' \
            | grep -Eq '\<(kustomizations?|ks)\>'; }; then
    mark found_failure
  fi
fi

# fixed_and_pushed - the pushed manifest on main dropped the broken tag and uses
# nginx:alpine. Reading the bare repo means this only trips after a real push.
if ! done_q fixed_and_pushed; then
  content=$(git -C "$BARE" show main:deploy/cosmos-web.yaml 2>/dev/null)
  if [ -n "$content" ] \
     && ! printf '%s\n' "$content" | grep -q 'DOESNOTEXIST' \
     && printf '%s\n' "$content" | grep -Eq 'image:[[:space:]]*nginx:alpine'; then
    mark fixed_and_pushed
  fi
fi

# healthy_again - the Kustomization recovered (Ready==True) and the app is back.
if ! done_q healthy_again; then
  status=$(kubectl -n default get kustomization cosmos-web \
            -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
  avail=$(kubectl -n default get deploy cosmos-web \
           -o jsonpath='{.status.availableReplicas}' 2>/dev/null)
  if [ "$status" = "True" ] && [ "${avail:-0}" -ge 1 ] 2>/dev/null; then
    mark healthy_again
  fi
fi

exit 0
