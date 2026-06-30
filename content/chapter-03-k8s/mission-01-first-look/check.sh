#!/usr/bin/env bash
# Mission 03.01 validator - runs every 2s. All three objectives are read-only
# observations (version / cluster-info / get nodes have no side-effects worth
# checking), so we use bash-history grep - same approach as Chapter 1.

set +e

HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# ran_version - `kubectl version` in any form. Match `kubectl <flags?> version`
# but reject substrings like `versionx` or unrelated wrappers.
if ! done_q ran_version; then
  grep -Eq '(^|[[:space:];|&(`])kubectl[[:space:]]+(-[^[:space:]]+[[:space:]]+)*version([[:space:]]|$)' \
       "$HIST" 2>/dev/null \
    && mark ran_version
fi

# saw_cluster_info - `kubectl cluster-info` (any flags / subcommands).
if ! done_q saw_cluster_info; then
  grep -Eq '(^|[[:space:];|&(`])kubectl[[:space:]]+(-[^[:space:]]+[[:space:]]+)*cluster-info([[:space:]]|$)' \
       "$HIST" 2>/dev/null \
    && mark saw_cluster_info
fi

# listed_nodes - `kubectl get nodes` or `kubectl get node`. Optional flags
# between `get` and the kind, e.g. `kubectl get -o wide nodes`.
if ! done_q listed_nodes; then
  grep -Eq '(^|[[:space:];|&(`])kubectl[[:space:]]+(-[^[:space:]]+[[:space:]]+)*get([[:space:]]+(-[^[:space:]]+|--?[a-zA-Z][^[:space:]]*))*[[:space:]]+nodes?([[:space:]]|$)' \
       "$HIST" 2>/dev/null \
    && mark listed_nodes
fi

exit 0
