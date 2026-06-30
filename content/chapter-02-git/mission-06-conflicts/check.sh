#!/usr/bin/env bash
# Mission 02.06 validator. Detects progression through the conflict workflow
# from repo state. Side-effect-free beyond /tmp/.cosmos/<id>.

set +e

REPO="$HOME/work/cosmos-conflicts"
HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

[ -d "$REPO/.git" ] || exit 0

# 1. committed_change - local main has at least one commit beyond
#    player-start (the snapshot point setup reset to). Stays true forever
#    once they've made the commit, including after the merge.
if ! done_q committed_change; then
  if git -C "$REPO" rev-parse --verify refs/tags/player-start >/dev/null 2>&1; then
    ahead=$(git -C "$REPO" rev-list --count player-start..HEAD 2>/dev/null)
    if [ "${ahead:-0}" -ge 1 ]; then
      mark committed_change
    fi
  fi
fi

# 2. hit_rejection - proxy: the player has run `git push` AND has run
#    `git pull` (or `git fetch`). Either order works. We don't try to detect
#    the rejection itself, just that the player attempted the workflow.
#    Also gate on actually having committed something locally so this can't
#    fire on a confused early run.
if ! done_q hit_rejection; then
  if done_q committed_change; then
    pushed=$(grep -Eq '(^|[[:space:];|&(`])git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*push([[:space:]]|$)' \
                 "$HIST" 2>/dev/null && echo y || echo n)
    pulled=$(grep -Eq '(^|[[:space:];|&(`])git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*(pull|fetch)([[:space:]]|$)' \
                 "$HIST" 2>/dev/null && echo y || echo n)
    if [ "$pushed" = "y" ] && [ "$pulled" = "y" ]; then
      mark hit_rejection
    fi
  fi
fi

# 3. resolved_conflict - local main contains a merge commit, the working
#    tree has no conflict markers in manifest.txt, the merge is no longer
#    in progress (no MERGE_HEAD), AND the merged manifest contains BOTH
#    Captain Q (from remote) and Storm (from the player's commit).
if ! done_q resolved_conflict; then
  has_merge=$(git -C "$REPO" log --merges -1 --pretty=%H 2>/dev/null)
  no_in_progress=$([ ! -f "$REPO/.git/MERGE_HEAD" ] && echo y || echo n)
  no_markers=$(! grep -Eq '^(<<<<<<<|=======|>>>>>>>)' "$REPO/manifest.txt" 2>/dev/null \
                  && echo y || echo n)
  has_both=$(grep -q 'Captain Q' "$REPO/manifest.txt" 2>/dev/null \
             && grep -q 'Storm' "$REPO/manifest.txt" 2>/dev/null \
             && echo y || echo n)
  if [ -n "$has_merge" ] && [ "$no_in_progress" = "y" ] \
     && [ "$no_markers" = "y" ] && [ "$has_both" = "y" ]; then
    mark resolved_conflict
  fi
fi

# 4. pushed_resolution - bare main now matches local main, AND that tip is
#    the merge commit (i.e., the rejection's been resolved upstream).
if ! done_q pushed_resolution; then
  if done_q resolved_conflict; then
    bare_tip=$(git -C /srv/repos/cosmos-conflicts.git rev-parse refs/heads/main 2>/dev/null)
    local_tip=$(git -C "$REPO" rev-parse HEAD 2>/dev/null)
    if [ -n "$bare_tip" ] && [ "$bare_tip" = "$local_tip" ]; then
      mark pushed_resolution
    fi
  fi
fi

exit 0
