#!/usr/bin/env bash
# Mission 01 validator - runs every 2s. Inspects bash history; touches a marker
# under /tmp/.cosmos/<objective_id> as each objective is met. Side-effect-free
# beyond the marker files.

# Never crash the validator loop on any error.
set +e

HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos

mark()  { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# Objective: printed_pwd - any line in history that is just `pwd` (optionally
# with whitespace / args). Wrapping commands like `(pwd)` or `echo $(pwd)` also
# count because the history line still contains the word `pwd`.
if ! done_q printed_pwd; then
  grep -Eq '(^|[[:space:];|&(`])pwd([[:space:];|&)`]|$)' "$HIST" 2>/dev/null \
    && mark printed_pwd
fi

# Objective: listed_welcome - `ls` with anything that resolves to the welcome
# folder. We accept `ls welcome`, `ls ./welcome`, `ls ~/welcome`, `ls welcome/`,
# `ls /home/dev/welcome` and `ll welcome` (the bashrc alias).
if ! done_q listed_welcome; then
  grep -Eq '(^|[[:space:];|&(`])(ls|ll|la)([[:space:]]+-[A-Za-z]+)*[[:space:]]+([./~]*|/home/dev/)welcome/?($|[[:space:]])' "$HIST" 2>/dev/null \
    && mark listed_welcome
fi

# Objective: entered_crew - `cd` into welcome/crew (any reasonable spelling).
if ! done_q entered_crew; then
  grep -Eq '(^|[[:space:];|&(`])cd[[:space:]]+([./~]*|/home/dev/)welcome/crew/?($|[[:space:]])' "$HIST" 2>/dev/null \
    && mark entered_crew
fi

exit 0
