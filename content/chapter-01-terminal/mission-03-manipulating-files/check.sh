#!/usr/bin/env bash
# Mission 03 validator - checks filesystem state directly. No history grepping
# needed: we can see exactly what the player produced.

set +e

mkdir -p /tmp/.cosmos
mark()  { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

if ! done_q created_logs_dir; then
  [ -d "$HOME/scratch/logs" ] && mark created_logs_dir
fi

if ! done_q touched_app_log; then
  [ -f "$HOME/scratch/logs/app.log" ] && mark touched_app_log
fi

# copied_template: today.txt exists in logs/ AND its content matches the
# template (so a `touch` of an empty file doesn't accidentally pass).
if ! done_q copied_template; then
  if [ -f "$HOME/scratch/logs/today.txt" ] \
     && [ -f "$HOME/scratch/template.txt" ] \
     && cmp -s "$HOME/scratch/logs/today.txt" "$HOME/scratch/template.txt"; then
    mark copied_template
  fi
fi

if ! done_q removed_old_file; then
  [ ! -e "$HOME/scratch/old-notes.txt" ] && mark removed_old_file
fi

exit 0
