#!/usr/bin/env bash
# Mission 02.02 validator. Side-effect-free beyond /tmp/.cosmos/<id>.

set +e

REPO="$HOME/work/repo"
HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# 1. ran_diff - read-only command; we look for it in bash history. Tolerant
#    of flags like `git --no-pager diff` and `git diff --staged`.
if ! done_q ran_diff; then
  grep -Eq '(^|[[:space:];|&(`])git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*diff([[:space:]]|$)' \
       "$HIST" 2>/dev/null \
    && mark ran_diff
fi

# 2. created_gitignore - file exists at the repo root.
if ! done_q created_gitignore; then
  if [ -f "$REPO/.gitignore" ]; then
    mark created_gitignore
  fi
fi

# 3. ignored_extras - git agrees that *both* noise paths are now ignored.
#    `check-ignore` exits 0 if a path matches a .gitignore rule. We need both.
if ! done_q ignored_extras; then
  if [ -d "$REPO/.git" ]; then
    if git -C "$REPO" check-ignore -q secrets.env 2>/dev/null \
       && git -C "$REPO" check-ignore -q build/output.log 2>/dev/null; then
      mark ignored_extras
    fi
  fi
fi

# 4. committed_change - at least 2 commits, AND .gitignore is tracked in HEAD,
#    AND the working tree is clean for notes.md (i.e., the typo fix is in HEAD).
if ! done_q committed_change; then
  if [ -d "$REPO/.git" ] && git -C "$REPO" rev-parse --verify HEAD >/dev/null 2>&1; then
    commits=$(git -C "$REPO" rev-list --count HEAD 2>/dev/null)
    if [ "${commits:-0}" -ge 2 ]; then
      gitignore_tracked=$(git -C "$REPO" ls-files --error-unmatch .gitignore 2>/dev/null)
      notes_clean=$(git -C "$REPO" diff --quiet HEAD -- notes.md && echo y || echo n)
      if [ -n "$gitignore_tracked" ] && [ "$notes_clean" = "y" ]; then
        # Also check that the typo is gone from the committed notes.md.
        if ! git -C "$REPO" show HEAD:notes.md 2>/dev/null | grep -q 'coffeee'; then
          mark committed_change
        fi
      fi
    fi
  fi
fi

exit 0
