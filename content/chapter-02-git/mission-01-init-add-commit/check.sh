#!/usr/bin/env bash
# Mission 02.01 validator - runs every 2s. Inspects repo state (and bash
# history for the read-only `git status` / `git log` observations). Touches
# /tmp/.cosmos/<objective_id>. Side-effect-free beyond those markers.

set +e

REPO="$HOME/work/repo"
HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# 1. did_init - `.git/` directory exists inside the repo.
if ! done_q did_init; then
  if [ -d "$REPO/.git" ]; then
    mark did_init
  fi
fi

# 2. saw_status - bash history shows the player ran `git status`.
#    git status is purely read-only; there's no repo state to observe, so this
#    one objective uses a history grep. Conservative pattern: any line with
#    `git ... status` (no `git statusxyz`).
if ! done_q saw_status; then
  grep -Eq '(^|[[:space:];|&(`])git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*status([[:space:]]|$)' \
       "$HIST" 2>/dev/null \
    && mark saw_status
fi

# 3. staged_files - at least one file is tracked in the index. Works whether
#    the player has only `git add`-ed (file in index, no commit yet) OR has
#    already committed (commit means files are tracked, ls-files lists them).
if ! done_q staged_files; then
  if [ -d "$REPO/.git" ]; then
    if [ -n "$(git -C "$REPO" ls-files 2>/dev/null | head -n1)" ]; then
      mark staged_files
    fi
  fi
fi

# 4. made_commit - at least one commit on the current branch.
if ! done_q made_commit; then
  if [ -d "$REPO/.git" ] && git -C "$REPO" rev-parse --verify HEAD >/dev/null 2>&1; then
    mark made_commit
  fi
fi

# 5. viewed_log - bash history shows the player ran `git log`.
if ! done_q viewed_log; then
  grep -Eq '(^|[[:space:];|&(`])git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*log([[:space:]]|$)' \
       "$HIST" 2>/dev/null \
    && mark viewed_log
fi

exit 0
