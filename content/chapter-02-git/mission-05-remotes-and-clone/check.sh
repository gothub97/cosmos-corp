#!/usr/bin/env bash
# Mission 02.05 validator. The player's clone could in theory be at any path
# under ~/work - we walk those folders to find one whose `origin` URL ends
# in `/cosmos.git`. Most validators read repo state; the read-only commands
# (`git remote -v`, `git fetch`, `git pull`) are detected via bash history.

set +e

HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# Find any clone of cosmos.git under ~/work. Prints the absolute path of the
# clone, or nothing.
find_clone() {
  shopt -s nullglob
  for d in "$HOME/work/"*/; do
    [ -d "${d}.git" ] || continue
    url=$(git -C "${d%/}" remote get-url origin 2>/dev/null)
    case "$url" in
      *"/cosmos.git") echo "${d%/}"; return 0 ;;
    esac
  done
  return 1
}

CLONE="$(find_clone || true)"

# 1. cloned_repo - any clone of cosmos.git exists under ~/work.
if ! done_q cloned_repo; then
  if [ -n "$CLONE" ]; then
    mark cloned_repo
  fi
fi

# 2. listed_remotes - read-only; history grep.
if ! done_q listed_remotes; then
  grep -Eq '(^|[[:space:];|&(`])git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*remote([[:space:]]|$)' \
       "$HIST" 2>/dev/null \
    && mark listed_remotes
fi

# 3. fetched - history grep for `git fetch`.
if ! done_q fetched; then
  grep -Eq '(^|[[:space:];|&(`])git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*fetch([[:space:]]|$)' \
       "$HIST" 2>/dev/null \
    && mark fetched
fi

# 4. committed_locally - local main is ≥1 commit ahead of where the bare
#    repo currently is, OR (if they've already pushed) the local main has
#    more commits than the snapshot's pristine state.
if ! done_q committed_locally; then
  if [ -n "$CLONE" ]; then
    # Snapshot's main tip - that's the pristine SHA. Anything newer = a
    # commit the player added.
    snap_tip=$(git -C /srv/repos/.snapshots/cosmos.git rev-parse refs/heads/main 2>/dev/null)
    local_tip=$(git -C "$CLONE" rev-parse HEAD 2>/dev/null)
    if [ -n "$snap_tip" ] && [ -n "$local_tip" ] && [ "$snap_tip" != "$local_tip" ]; then
      # Confirm local is a descendant - they didn't reset to something weird.
      if git -C "$CLONE" merge-base --is-ancestor "$snap_tip" "$local_tip" 2>/dev/null; then
        mark committed_locally
      fi
    fi
  fi
fi

# 5. pushed_to_origin - bare repo's main has advanced past the snapshot tip
#    AND matches the player's local main.
if ! done_q pushed_to_origin; then
  if [ -n "$CLONE" ]; then
    bare_tip=$(git -C /srv/repos/cosmos.git rev-parse refs/heads/main 2>/dev/null)
    snap_tip=$(git -C /srv/repos/.snapshots/cosmos.git rev-parse refs/heads/main 2>/dev/null)
    local_tip=$(git -C "$CLONE" rev-parse HEAD 2>/dev/null)
    if [ -n "$bare_tip" ] && [ -n "$snap_tip" ] && [ -n "$local_tip" ] \
       && [ "$bare_tip" = "$local_tip" ] \
       && [ "$bare_tip" != "$snap_tip" ]; then
      mark pushed_to_origin
    fi
  fi
fi

# 6. pulled - read-only-ish; history grep.
if ! done_q pulled; then
  grep -Eq '(^|[[:space:];|&(`])git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*pull([[:space:]]|$)' \
       "$HIST" 2>/dev/null \
    && mark pulled
fi

exit 0
