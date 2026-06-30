#!/usr/bin/env bash
# Mission 06 validator. Checks process state, file permissions, and history for
# the `ps` invocation.

set +e

HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos
mark()  { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# listed_processes - history shows a `ps` invocation. We accept any flag combo.
if ! done_q listed_processes; then
  grep -Eq '(^|[[:space:];|&(`])ps([[:space:]]|$)' "$HIST" 2>/dev/null \
    && mark listed_processes
fi

# killed_sleeper - no `sleep 9999` (or process named cosmos-sleeper) is running
# under our uid anymore. We also confirm there *was* one to kill: the marker
# /tmp/.cosmos/_sleeper_started is dropped by setup.sh - but we didn't add that.
# Fallback: check the marker has not been set yet (so the killing didn't happen
# pre-mission) and that ps shows zero matching processes now.
if ! done_q killed_sleeper; then
  if ! pgrep -u "$(id -u)" -f 'sleep 9999' >/dev/null 2>&1 \
     && ! pgrep -u "$(id -u)" -f 'cosmos-sleeper' >/dev/null 2>&1; then
    # Only mark if at least one history line shows the player tried to kill -
    # otherwise we'd accidentally pass on a never-started sleeper after a
    # docker restart.
    if grep -Eq '(^|[[:space:];|&(`])(kill[[:space:]]|pkill|killall)' "$HIST" 2>/dev/null; then
      mark killed_sleeper
    fi
  fi
fi

# made_executable - owner of ~/work/deploy.sh has the execute bit set.
if ! done_q made_executable; then
  if [ -x "$HOME/work/deploy.sh" ]; then
    mark made_executable
  fi
fi

exit 0
