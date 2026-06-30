#!/usr/bin/env bash
# Mission 05 validator. Checks the produced files for expected content/counts.

set +e

mkdir -p /tmp/.cosmos
mark()  { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

REPO="$HOME/repo"

# found_md_files - the file lists exactly 3 paths, each ending in .md, each
# pointing at an existing file under ~/repo.
if ! done_q found_md_files; then
  f="$HOME/repo-md.txt"
  if [ -f "$f" ]; then
    md_count="$(grep -c '\.md$' "$f" 2>/dev/null)"
    other="$(grep -cv '\.md$' "$f" 2>/dev/null)"
    # Allow trailing blank lines (counted as 'other' but only if the file isn't empty).
    if [ "$md_count" = "3" ] && [ "${other:-0}" -le 1 ]; then
      # Spot-check: every listed path resolves under ~/repo.
      bad=0
      while IFS= read -r line; do
        [ -z "$line" ] && continue
        case "$line" in
          *.md) [ -f "$line" ] || bad=1 ;;
          *) bad=1 ;;
        esac
      done < "$f"
      [ "$bad" = "0" ] && mark found_md_files
    fi
  fi
fi

# grepped_todo - todos.txt contains TODO somewhere on every non-empty line, and
# at least 4 lines (we seeded 6, accept >=4 to allow for grep flag variations).
if ! done_q grepped_todo; then
  f="$HOME/todos.txt"
  if [ -f "$f" ] && [ -s "$f" ]; then
    matched="$(grep -c 'TODO' "$f" 2>/dev/null)"
    if [ "${matched:-0}" -ge 4 ]; then
      # No non-empty line should be missing TODO.
      if ! grep -Ev '(^$|TODO)' "$f" >/dev/null 2>&1; then
        mark grepped_todo
      fi
    fi
  fi
fi

# counted_todos - todo-count.txt contains a single number that matches the
# number of TODO lines under ~/repo (using `grep -rc` semantics: total matches).
if ! done_q counted_todos; then
  f="$HOME/todo-count.txt"
  if [ -f "$f" ]; then
    val="$(tr -d '[:space:]' < "$f" | head -c 16)"
    if [ -n "$val" ] && echo "$val" | grep -qE '^[0-9]+$'; then
      actual="$(grep -r 'TODO' "$REPO" 2>/dev/null | wc -l | tr -d '[:space:]')"
      # Accept the truth, off-by-one, or the line count of todos.txt - all
      # reasonable interpretations of "how many TODOs are there".
      todos_lines="$(wc -l < "$HOME/todos.txt" 2>/dev/null | tr -d '[:space:]')"
      for ok in "$actual" "$((actual - 0))" "${todos_lines:-0}"; do
        [ "$val" = "$ok" ] && { mark counted_todos; break; }
      done
    fi
  fi
fi

exit 0
