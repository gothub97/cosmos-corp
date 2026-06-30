#!/usr/bin/env bash
# Mission 04.05 validator - runs every 2s.
#   scaled_down     → history grep: the player ran `kubectl scale ... cosmos-web
#                     --replicas=1`. History (not live state) so the transient
#                     drop isn't missed if Flux heals fast.
#   reconciled_back → REAL state, gated: we must FIRST observe the drift (spec
#                     dropped to <=1 after the scale) and THEN see it healed back
#                     to a steady 3 - proof Flux actually did the reconciling.

set +e

HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# scaled_down - history shows a `kubectl scale` of cosmos-web to 1 replica. The
# `-n default` and `deploy/`-vs-`deployment` forms vary, so filter in stages.
if ! done_q scaled_down; then
  if grep -E '(^|[[:space:];|&(`])kubectl[[:space:]]' "$HIST" 2>/dev/null \
       | grep -E '\<scale\>' \
       | grep -E 'cosmos-web' \
       | grep -Eq -e '--replicas[= ]+1([^0-9]|$)'; then
    mark scaled_down
  fi
fi

# _drift_observed (internal) - after the scale, the live Deployment's desired
# replicas actually dropped to <=1. This guarantees reconciled_back below means
# a real heal, not the steady-state 3 we started from.
if done_q scaled_down && [ ! -f /tmp/.cosmos/_drift_observed ]; then
  spec=$(kubectl -n default get deploy cosmos-web \
          -o jsonpath='{.spec.replicas}' 2>/dev/null)
  if [ -n "$spec" ] && [ "$spec" -le 1 ] 2>/dev/null; then
    touch /tmp/.cosmos/_drift_observed
  fi
fi

# reconciled_back - drift was observed, and Flux has restored a steady 3:
# desired replicas back to 3 AND all 3 pods available.
if [ -f /tmp/.cosmos/_drift_observed ] && ! done_q reconciled_back; then
  spec=$(kubectl -n default get deploy cosmos-web \
          -o jsonpath='{.spec.replicas}' 2>/dev/null)
  avail=$(kubectl -n default get deploy cosmos-web \
           -o jsonpath='{.status.availableReplicas}' 2>/dev/null)
  if [ "$spec" = "3" ] && [ "${avail:-0}" = "3" ]; then
    mark reconciled_back
  fi
fi

exit 0
