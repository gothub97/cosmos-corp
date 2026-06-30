#!/usr/bin/env bash
# Mission 02.01 setup - gives the player a fresh, *not-yet-tracked* folder so
# they can run `git init` from scratch. Idempotent: safe to re-run on retry.

set -euo pipefail

# Reset markers for this mission's objectives.
mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/did_init \
      /tmp/.cosmos/saw_status \
      /tmp/.cosmos/staged_files \
      /tmp/.cosmos/made_commit \
      /tmp/.cosmos/viewed_log

# Wipe and recreate the working folder. Keeping it under ~/work/ matches the
# convention used by every git mission.
mkdir -p "$HOME/work"
rm -rf "$HOME/work/repo"
mkdir -p "$HOME/work/repo"

# Seed two un-tracked files so the player has something to add.
cat > "$HOME/work/repo/notes.md" <<'EOF'
# Cosmos Corp - Crew Notes

Quick scratch pad for things to remember during onboarding week.

- Sage takes coffee black. Important.
- Captain Vex wants weekly status updates on Fridays.
EOF

cat > "$HOME/work/repo/roster.txt" <<'EOF'
Sage         - SRE, mentor
Captain Vex  - VPE
Doc Lina     - IC
Daymari      - IC (you)
EOF

cd "$HOME/work/repo"

exit 0
