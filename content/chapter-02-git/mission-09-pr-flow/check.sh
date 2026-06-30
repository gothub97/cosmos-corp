#!/usr/bin/env bash
# Mission 02.09 validator. Walks the PR-style loop.

set +e

REPO="$HOME/work/cosmos"
HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

[ -d "$REPO/.git" ] || exit 0

BRANCH="feature/handbook-update"

# 1. created_feature_branch - branch exists locally.
if ! done_q created_feature_branch; then
  if git -C "$REPO" show-ref --verify --quiet "refs/heads/$BRANCH"; then
    mark created_feature_branch
  fi
fi

# 2. pushed_feature - branch exists on the bare AND its tip matches the
#    local branch's tip. We don't require -u was used (that's pedagogy, not
#    correctness), only that the push happened.
if ! done_q pushed_feature; then
  bare_tip=$(git -C /srv/repos/cosmos.git rev-parse "refs/heads/$BRANCH" 2>/dev/null)
  local_tip=$(git -C "$REPO" rev-parse "refs/heads/$BRANCH" 2>/dev/null)
  if [ -n "$bare_tip" ] && [ -n "$local_tip" ] && [ "$bare_tip" = "$local_tip" ]; then
    mark pushed_feature
  fi
fi

# 3. fetched_review - local has the remote-tracking ref for the review
#    branch. Note: this ref is created by `git clone` too, so we additionally
#    require that the player has run `git fetch` since.
if ! done_q fetched_review; then
  ref_present=$(git -C "$REPO" show-ref --verify --quiet \
                  refs/remotes/origin/review-bot/handbook-feedback \
                && echo y || echo n)
  ran_fetch=$(grep -Eq '(^|[[:space:];|&(`])git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*fetch([[:space:]]|$)' \
                   "$HIST" 2>/dev/null && echo y || echo n)
  if [ "$ref_present" = "y" ] && [ "$ran_fetch" = "y" ]; then
    mark fetched_review
  fi
fi

# 4. addressed_review - feature branch tip has docs/handbook.md AND that
#    file contains a `## Conventions` section header.
if ! done_q addressed_review; then
  if git -C "$REPO" show-ref --verify --quiet "refs/heads/$BRANCH"; then
    if git -C "$REPO" cat-file -e "$BRANCH:docs/handbook.md" 2>/dev/null; then
      content=$(git -C "$REPO" show "$BRANCH:docs/handbook.md" 2>/dev/null)
      if echo "$content" | grep -Eiq '^##[[:space:]]+Conventions'; then
        mark addressed_review
      fi
    fi
  fi
fi

# 5. pushed_revision - bare's feature branch matches local's AND the
#    feature branch has ≥2 commits beyond main.
if ! done_q pushed_revision; then
  if done_q pushed_feature && done_q addressed_review; then
    bare_tip=$(git -C /srv/repos/cosmos.git rev-parse "refs/heads/$BRANCH" 2>/dev/null)
    local_tip=$(git -C "$REPO" rev-parse "refs/heads/$BRANCH" 2>/dev/null)
    ahead=$(git -C "$REPO" rev-list --count "main..$BRANCH" 2>/dev/null)
    if [ -n "$bare_tip" ] && [ "$bare_tip" = "$local_tip" ] && [ "${ahead:-0}" -ge 2 ]; then
      mark pushed_revision
    fi
  fi
fi

exit 0
