#!/usr/bin/env bash
# Mission 03 setup - give the player a clean ~/scratch/ workspace, plus a
# couple of files for them to copy and delete.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/created_logs_dir \
      /tmp/.cosmos/touched_app_log \
      /tmp/.cosmos/copied_template \
      /tmp/.cosmos/removed_old_file

# Reset scratch each run so the player can retry cleanly.
rm -rf "$HOME/scratch" 2>/dev/null || true
mkdir -p "$HOME/scratch"

cat > "$HOME/scratch/template.txt" <<'EOF'
# Daily log - fill me in
date:
status:
notes:
EOF

cat > "$HOME/scratch/old-notes.txt" <<'EOF'
Old notes from before. Safe to delete.
EOF

cd "$HOME"
exit 0
