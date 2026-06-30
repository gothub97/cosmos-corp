#!/usr/bin/env bash
# Mission 04.01 validator - runs every 2s. All three objectives are read-only
# recon commands, so we use bash-history grep, same approach as Chapter 3's
# read-only missions.

set +e

HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# ran_flux_check - `flux check` in any form (`flux check`, `flux check --pre`).
if ! done_q ran_flux_check; then
  grep -Eq '(^|[[:space:];|&(`])flux[[:space:]]+(-[^[:space:]]+[[:space:]]+)*check([[:space:]]|$)' \
       "$HIST" 2>/dev/null \
    && mark ran_flux_check
fi

# listed_flux_system - a `kubectl get pods` (or deploy) scoped to flux-system.
# The `-n flux-system` can appear before OR after the kind, so we filter the
# line in stages rather than pin an order.
if ! done_q listed_flux_system; then
  grep -E '(^|[[:space:];|&(`])kubectl[[:space:]]' "$HIST" 2>/dev/null \
    | grep -E '\<get\>' \
    | grep -E '\<(pods?|po|deploy|deployments?)\>' \
    | grep -q 'flux-system' \
    && mark listed_flux_system
fi

# saw_flux_all - `flux get all` (optionally `-A` / `-n <ns>`).
if ! done_q saw_flux_all; then
  grep -Eq '(^|[[:space:];|&(`])flux[[:space:]]+(-[^[:space:]]+[[:space:]]+)*get([[:space:]]+(-[^[:space:]]+|--?[a-zA-Z][^[:space:]]*))*[[:space:]]+all([[:space:]]|$)' \
       "$HIST" 2>/dev/null \
    && mark saw_flux_all
fi

exit 0
