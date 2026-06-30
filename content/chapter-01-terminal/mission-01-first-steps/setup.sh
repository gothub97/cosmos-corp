#!/usr/bin/env bash
# Mission 01 setup - gives the player a clean welcome/ tree to explore.
# Idempotent: safe to re-run on retry / mission restart.

set -euo pipefail

# Reset markers for *this* mission's objectives so a retry starts clean.
mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/printed_pwd \
      /tmp/.cosmos/listed_welcome \
      /tmp/.cosmos/entered_crew

# The base image already ships /home/dev/welcome. Re-seed if missing or empty -
# a previous mission may have moved/deleted things.
if [ ! -d "$HOME/welcome" ] || [ -z "$(ls -A "$HOME/welcome" 2>/dev/null)" ]; then
  mkdir -p "$HOME/welcome/crew" "$HOME/welcome/notes"
  cat > "$HOME/welcome/README.md" <<'EOF'
# Welcome to Cosmos Corp

Hey - Sage here. Glad to have you on the team.
EOF
  cat > "$HOME/welcome/schedule.txt" <<'EOF'
Cosmos Corp - Onboarding Week
==============================
Mon  Terminal warm-up
Tue  File system tour
EOF
  printf 'Name: Sage\nRole: SRE\n' > "$HOME/welcome/crew/sage.txt"
  printf 'Name: Captain Vex\nRole: VPE\n' > "$HOME/welcome/crew/captain.txt"
  printf 'Name: Doc Lina\nRole: IC\n' > "$HOME/welcome/crew/medic.txt"
fi

# Always make sure the player is at the home dir when the mission starts -
# the PTY the Rust side opens is fresh, but during dev a re-run may inherit
# the previous cwd. Best-effort.
cd "$HOME"

exit 0
