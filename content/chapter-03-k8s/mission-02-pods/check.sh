#!/usr/bin/env bash
# Mission 03.02 validator - runs every 2s.
# Mix of real-state checks (created_pod, deleted_pod) and history grep for
# read-only commands (listed_pods, described_pod, viewed_logs).

set +e

HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# created_pod - pod named `tinypod` exists. Once they hit `kubectl run`, the
# pod is in the API; the cluster view will show it materialise.
if ! done_q created_pod; then
  if kubectl get pod tinypod >/dev/null 2>&1; then
    mark created_pod
  fi
fi

# listed_pods - history grep for `kubectl get pod` (singular or plural).
if ! done_q listed_pods; then
  grep -Eq '(^|[[:space:];|&(`])kubectl[[:space:]]+(-[^[:space:]]+[[:space:]]+)*get([[:space:]]+(-[^[:space:]]+|--?[a-zA-Z][^[:space:]]*))*[[:space:]]+pods?([[:space:]]|$)' \
       "$HIST" 2>/dev/null \
    && mark listed_pods
fi

# described_pod - history grep for `kubectl describe pod ...` (any form).
if ! done_q described_pod; then
  grep -Eq '(^|[[:space:];|&(`])kubectl[[:space:]]+(-[^[:space:]]+[[:space:]]+)*describe([[:space:]]+(-[^[:space:]]+|--?[a-zA-Z][^[:space:]]*))*[[:space:]]+(pods?|pod/[^[:space:]]+)([[:space:]]|$)' \
       "$HIST" 2>/dev/null \
    && mark described_pod
fi

# viewed_logs - history grep for `kubectl logs ...`.
if ! done_q viewed_logs; then
  grep -Eq '(^|[[:space:];|&(`])kubectl[[:space:]]+(-[^[:space:]]+[[:space:]]+)*logs([[:space:]]|$)' \
       "$HIST" 2>/dev/null \
    && mark viewed_logs
fi

# deleted_pod - only mark once `created_pod` is already marked (otherwise a
# fresh setup with no pod would tick this on the very first poll). Pod has to
# have existed and now be gone.
if done_q created_pod && ! done_q deleted_pod; then
  if ! kubectl get pod tinypod >/dev/null 2>&1; then
    mark deleted_pod
  fi
fi

exit 0
