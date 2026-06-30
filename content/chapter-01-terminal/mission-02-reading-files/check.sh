#!/usr/bin/env bash
# Mission 02 validator - every 2s. Marks each objective via /tmp/.cosmos.

set +e

HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos
mark()  { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# read_readme - `cat <something>README<something>`. We accept `cat README.md`
# from inside welcome/, or absolute / relative paths to it.
if ! done_q read_readme; then
  grep -Eq '(^|[[:space:];|&(`])cat[[:space:]]+([./~]*|/home/dev/)?(welcome/)?README\.md([[:space:]]|$)' "$HIST" 2>/dev/null \
    && mark read_readme
fi

# head_manifest - head of manifest.log. Don't be picky about -n value; any head
# pointed at manifest.log counts.
if ! done_q head_manifest; then
  grep -Eq '(^|[[:space:];|&(`])head([[:space:]]+-[A-Za-z0-9 ]+)*[[:space:]]+([./~]*|/home/dev/)?(welcome/)?manifest\.log' "$HIST" 2>/dev/null \
    && mark head_manifest
fi

# tail_manifest - same idea for tail.
if ! done_q tail_manifest; then
  grep -Eq '(^|[[:space:];|&(`])tail([[:space:]]+-[A-Za-z0-9 ]+)*[[:space:]]+([./~]*|/home/dev/)?(welcome/)?manifest\.log' "$HIST" 2>/dev/null \
    && mark tail_manifest
fi

# opened_less - `less` against manifest.log (or any file in welcome/). We accept
# `less welcome/manifest.log` and `less welcome/...`.
if ! done_q opened_less; then
  grep -Eq '(^|[[:space:];|&(`])less([[:space:]]+-[A-Za-z0-9 ]+)*[[:space:]]+([./~]*|/home/dev/)?(welcome/)?manifest\.log' "$HIST" 2>/dev/null \
    && mark opened_less
fi

exit 0
