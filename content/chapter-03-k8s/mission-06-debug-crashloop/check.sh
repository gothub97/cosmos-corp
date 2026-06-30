#!/usr/bin/env bash
# Mission 03.06 validator - runs every 2s.
#   described_broken  → bash history grep (describe is read-only)
#   viewed_broken_logs → bash history grep (logs is read-only)
#   fixed_image       → REAL cluster state: a pod with label app=broken is
#                       Running AND its single container is ready.

set +e

HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# described_broken - bash history shows `kubectl describe` aimed at the broken
# pod / deployment. Accept any flavour: `pod`, `pods`, `deploy`, `deployment`,
# `pod/<name>`, `-l app=broken`.
if ! done_q described_broken; then
  grep -Eq '(^|[[:space:];|&(`])kubectl[[:space:]]+(-[^[:space:]]+[[:space:]]+)*describe([[:space:]]|$)' \
       "$HIST" 2>/dev/null \
    && mark described_broken
fi

# viewed_broken_logs - bash history shows a `kubectl logs` invocation.
if ! done_q viewed_broken_logs; then
  grep -Eq '(^|[[:space:];|&(`])kubectl[[:space:]]+(-[^[:space:]]+[[:space:]]+)*logs([[:space:]]|$)' \
       "$HIST" 2>/dev/null \
    && mark viewed_broken_logs
fi

# fixed_image - at least one pod with label `app=broken` is in phase Running
# AND has all containers reporting ready=true. We use jsonpath rather than
# grep on `phase` so the check is unambiguous.
if ! done_q fixed_image; then
  phase=$(kubectl get pods -l app=broken -o jsonpath='{.items[0].status.phase}' 2>/dev/null)
  ready=$(kubectl get pods -l app=broken -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null)
  if [ "$phase" = "Running" ] && [ "$ready" = "true" ]; then
    mark fixed_image
  fi
fi

exit 0
