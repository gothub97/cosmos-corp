#!/usr/bin/env bash
# Mission 02 setup - keep the welcome/ tree intact (created in mission 01) and
# guarantee a multi-line manifest.log so head/tail/less are meaningful.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/read_readme \
      /tmp/.cosmos/head_manifest \
      /tmp/.cosmos/tail_manifest \
      /tmp/.cosmos/opened_less

mkdir -p "$HOME/welcome"

# Re-create README.md if missing.
if [ ! -f "$HOME/welcome/README.md" ]; then
  cat > "$HOME/welcome/README.md" <<'EOF'
# Welcome to Cosmos Corp

Hey - Sage here. Glad to have you on the team.

This folder is your sandbox for week one. Poke around freely.
EOF
fi

# Re-create manifest.log if missing or shorter than 30 lines (the mission
# objectives expect a chunky file).
if [ ! -f "$HOME/welcome/manifest.log" ] || [ "$(wc -l < "$HOME/welcome/manifest.log")" -lt 30 ]; then
  : > "$HOME/welcome/manifest.log"
  for i in $(seq 1 80); do
    printf '2026-04-29T09:%02d:%02dZ INFO  pipeline step %02d ok\n' \
      "$(( (i / 60) % 60 ))" "$(( i % 60 ))" "$i" \
      >> "$HOME/welcome/manifest.log"
  done
  printf '2026-04-29T09:05:49Z INFO  pipeline complete in 5m48s - STATUS=GREEN\n' \
    >> "$HOME/welcome/manifest.log"
fi

cd "$HOME"
exit 0
