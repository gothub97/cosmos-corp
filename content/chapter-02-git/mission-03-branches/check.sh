#!/usr/bin/env bash
# Mission 02.03 validator. Branch state via repo inspection.

set +e

REPO="$HOME/work/repo"
HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# 1. listed_branches - `git branch` is read-only; history grep.
if ! done_q listed_branches; then
  grep -Eq '(^|[[:space:];|&(`])git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*branch([[:space:]]|$)' \
       "$HIST" 2>/dev/null \
    && mark listed_branches
fi

# 2. created_feature_branch - branch by that exact name exists locally.
if ! done_q created_feature_branch; then
  if [ -d "$REPO/.git" ]; then
    if git -C "$REPO" show-ref --verify --quiet refs/heads/feature/intake-form; then
      mark created_feature_branch
    fi
  fi
fi

# 3. committed_on_branch - the feature branch is ahead of main by ≥1 commit.
if ! done_q committed_on_branch; then
  if [ -d "$REPO/.git" ] \
     && git -C "$REPO" show-ref --verify --quiet refs/heads/feature/intake-form; then
    ahead=$(git -C "$REPO" rev-list --count main..feature/intake-form 2>/dev/null)
    if [ "${ahead:-0}" -ge 1 ]; then
      mark committed_on_branch
    fi
  fi
fi

# 4. back_on_main - current branch is `main` AND the feature branch still
#    exists (so we know they actually went there and came back, not just
#    skipped the create step).
if ! done_q back_on_main; then
  if [ -d "$REPO/.git" ]; then
    cur=$(git -C "$REPO" symbolic-ref --quiet --short HEAD 2>/dev/null)
    if [ "$cur" = "main" ] \
       && git -C "$REPO" show-ref --verify --quiet refs/heads/feature/intake-form; then
      mark back_on_main
    fi
  fi
fi

exit 0
