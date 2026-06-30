#!/usr/bin/env bash
# Mission 02.03 setup - repo with two committed files on `main`. Player
# practises branching from there.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/listed_branches \
      /tmp/.cosmos/created_feature_branch \
      /tmp/.cosmos/committed_on_branch \
      /tmp/.cosmos/back_on_main

mkdir -p "$HOME/work"
rm -rf "$HOME/work/repo"
mkdir -p "$HOME/work/repo"
cd "$HOME/work/repo"

git init -q -b main

cat > README.md <<'EOF'
# Cosmos Corp - Onboarding Repo

A scratch repo for branching practice.
EOF
cat > roster.txt <<'EOF'
Sage         - SRE, mentor
Captain Vex  - VPE
Doc Lina     - IC
Daymari      - IC (you)
EOF

git add README.md roster.txt
git commit -q -m "Initial onboarding"

# A second commit so `git log --oneline` shows >1 entry - keeps the lesson
# concrete when the player runs `git log` after switching branches.
echo "" >> README.md
echo "Open a branch for any change." >> README.md
git add README.md
git commit -q -m "Note branch policy"

exit 0
