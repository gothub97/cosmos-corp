#!/usr/bin/env bash
# Mission 02.07 validator. Detects branch state + a successful interactive
# rebase. Side-effect-free beyond /tmp/.cosmos/<id>.

set +e

REPO="$HOME/work/repo"
HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

[ -d "$REPO/.git" ] || exit 0

# 1. on_feature_branch - the player has switched to feature/onboarding.
if ! done_q on_feature_branch; then
  cur=$(git -C "$REPO" symbolic-ref --quiet --short HEAD 2>/dev/null)
  if [ "$cur" = "feature/onboarding" ]; then
    mark on_feature_branch
  fi
fi

# 2. cleaned_history - exactly 1 commit on the branch beyond main, AND no
#    rebase is currently in progress, AND onboarding.md still exists in HEAD.
if ! done_q cleaned_history; then
  if git -C "$REPO" show-ref --verify --quiet refs/heads/feature/onboarding; then
    ahead=$(git -C "$REPO" rev-list --count main..feature/onboarding 2>/dev/null)
    in_progress="n"
    [ -d "$REPO/.git/rebase-merge" ] || [ -d "$REPO/.git/rebase-apply" ] && in_progress="y"
    has_file=$(git -C "$REPO" cat-file -e feature/onboarding:onboarding.md 2>/dev/null \
               && echo y || echo n)
    if [ "${ahead:-0}" -eq 1 ] && [ "$in_progress" = "n" ] && [ "$has_file" = "y" ]; then
      mark cleaned_history
    fi
  fi
fi

# 3. confirmed_clean - a `git log` invocation in the bash history (proxy for
#    "they verified"). Gate on cleaned_history so it can't fire before the
#    rebase succeeded.
if ! done_q confirmed_clean; then
  if done_q cleaned_history; then
    grep -Eq '(^|[[:space:];|&(`])git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*log([[:space:]]|$)' \
         "$HIST" 2>/dev/null \
      && mark confirmed_clean
  fi
fi

exit 0
