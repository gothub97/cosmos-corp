#!/usr/bin/env bash
# Mission 07 setup - clear leftover output, ensure ~/work exists.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/exported_env \
      /tmp/.cosmos/defined_alias \
      /tmp/.cosmos/wrote_hello_script \
      /tmp/.cosmos/ran_hello_script

mkdir -p "$HOME/work"
# Remove a possible previous attempt so the player starts each retry clean.
rm -f "$HOME/work/hello.sh" "$HOME/work/hello.out" 2>/dev/null || true

cd "$HOME"
exit 0
