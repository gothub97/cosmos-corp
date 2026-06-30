#!/usr/bin/env bash
# Mission 02.04 validator. Inspects merge state via the commit graph.

set +e

REPO="$HOME/work/repo"
mkdir -p /tmp/.cosmos

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

[ -d "$REPO/.git" ] || exit 0

# Helper - does $1 contain $2 in its history (i.e., is $2 reachable from $1)?
contains() {
  git -C "$REPO" merge-base --is-ancestor "$2" "$1" 2>/dev/null
}

# 1. did_ff_merge - topic/banner's tip is reachable from main, AND main is
#    NOT a true merge commit at that point (a fast-forward leaves main as a
#    linear chain). We approximate "FF happened" with: main contains banner's
#    tip AND for the first commit on main that introduces banner.txt, that
#    commit has exactly one parent (i.e., it's the regular banner commit, not
#    a synthetic merge). Easier proxy: main contains topic/banner's tip
#    *directly* (banner's tip is itself reachable on main's first-parent line).
if ! done_q did_ff_merge; then
  if git -C "$REPO" show-ref --verify --quiet refs/heads/topic/banner \
     && contains main topic/banner; then
    banner_tip=$(git -C "$REPO" rev-parse topic/banner)
    # Walk first-parent history of main; banner_tip must appear there for a
    # true FF (vs. being merged in as a side parent).
    if git -C "$REPO" rev-list --first-parent main 2>/dev/null \
         | grep -q "^${banner_tip}$"; then
      mark did_ff_merge
    fi
  fi
fi

# 2. did_three_way_merge - main contains topic/footer's tip AND there is at
#    least one merge commit on main (= a commit with 2+ parents).
if ! done_q did_three_way_merge; then
  if git -C "$REPO" show-ref --verify --quiet refs/heads/topic/footer \
     && contains main topic/footer; then
    merges=$(git -C "$REPO" log --merges --oneline main 2>/dev/null | wc -l)
    if [ "${merges:-0}" -ge 1 ]; then
      mark did_three_way_merge
    fi
  fi
fi

# 3. history_is_correct - both files exist on main's working tree AND both
#    branches are fully reachable.
if ! done_q history_is_correct; then
  if [ -f "$REPO/banner.txt" ] && [ -f "$REPO/footer.txt" ] \
     && contains main topic/banner && contains main topic/footer; then
    mark history_is_correct
  fi
fi

exit 0
