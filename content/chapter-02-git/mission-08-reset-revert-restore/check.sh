#!/usr/bin/env bash
# Mission 02.08 validator. Three independent checks against repo state.

set +e

REPO="$HOME/work/repo"
mkdir -p /tmp/.cosmos

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

[ -d "$REPO/.git" ] || exit 0

# 1. did_restore - notes.md in the working tree matches HEAD's version
#    (i.e., the unstaged edit has been thrown away). The file must still
#    exist (they didn't `rm` it) and `git diff HEAD -- notes.md` must be
#    empty.
if ! done_q did_restore; then
  if [ -f "$REPO/notes.md" ] \
     && git -C "$REPO" diff --quiet HEAD -- notes.md 2>/dev/null \
     && ! grep -q "ACTUALLY EVERYONE LOVES STANDUPS" "$REPO/notes.md" 2>/dev/null; then
    mark did_restore
  fi
fi

# 2. did_reset - scratch.txt is no longer in the index. The file may still
#    exist on disk as untracked; that's fine.
if ! done_q did_reset; then
  in_index=$(git -C "$REPO" ls-files --cached scratch.txt 2>/dev/null | head -1)
  staged_change=$(git -C "$REPO" diff --cached --name-only 2>/dev/null | grep -Fx scratch.txt)
  if [ -z "$in_index" ] && [ -z "$staged_change" ]; then
    mark did_reset
  fi
fi

# 3. did_revert - there is a commit on main whose subject starts with
#    "Revert" (the default git revert message). Defensive: also confirm
#    captain.md no longer contains the misspelling.
if ! done_q did_revert; then
  has_revert=$(git -C "$REPO" log --oneline -10 2>/dev/null | grep -Eq '^[a-f0-9]+[[:space:]]+Revert ' \
               && echo y || echo n)
  fixed=$(git -C "$REPO" cat-file -e HEAD:captain.md 2>/dev/null \
          && ! git -C "$REPO" show HEAD:captain.md 2>/dev/null | grep -q 'Capatin' \
          && echo y || echo n)
  if [ "$has_revert" = "y" ] && [ "$fixed" = "y" ]; then
    mark did_revert
  fi
fi

exit 0
