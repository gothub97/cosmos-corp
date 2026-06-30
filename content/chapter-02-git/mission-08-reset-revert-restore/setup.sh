#!/usr/bin/env bash
# Mission 02.08 setup - repo with a deliberate mess for the player to clean
# up using restore, reset, and revert.
#
# Final state:
#   • main has 4 commits:
#       1. Initial scaffold      (README.md, roster.txt)
#       2. Add captain           (captain.md)
#       3. Typo: capatin         ← THIS is the commit the player will revert
#       4. Add manifest          (manifest.txt)
#   • notes.md present + tracked + working-tree-modified  → use `git restore`
#   • scratch.txt present + STAGED                        → use `git reset`

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/did_restore \
      /tmp/.cosmos/did_reset \
      /tmp/.cosmos/did_revert

mkdir -p "$HOME/work"
rm -rf "$HOME/work/repo"
mkdir -p "$HOME/work/repo"
cd "$HOME/work/repo"

git init -q -b main

# Commit 1
cat > README.md <<'EOF'
# Cosmos Corp Repo

Three undo commands enter. One of them is the right one.
EOF
cat > roster.txt <<'EOF'
Sage         - SRE, mentor
Captain Vex  - VPE
Doc Lina     - IC
EOF
cat > notes.md <<'EOF'
# Crew Notes

- Sage: prefers async standups
- Vex: caffeine-driven
EOF
git add README.md roster.txt notes.md
git commit -q -m "Initial scaffold"

# Commit 2
cat > captain.md <<'EOF'
# Captain Vex

VPE. In charge of the orbital fleet.
EOF
git add captain.md
git commit -q -m "Add captain"

# Commit 3 - the typo we'll revert. Use the misspelled "capatin" in the file
# content so the revert produces a visible diff.
cat > captain.md <<'EOF'
# Capatin Vex

VPE. In charge of the orbital fleet.
EOF
git add captain.md
git commit -q -m "Typo: capatin"

# Commit 4
cat > manifest.txt <<'EOF'
# Pilots manifest
Sage      | Falcon-1 | A
Vex       | Falcon-2 | A
Doc Lina  | Medic-1  | B
EOF
git add manifest.txt
git commit -q -m "Add manifest"

# Working-tree mess for `git restore`: edit notes.md.
cat > notes.md <<'EOF'
# Crew Notes

- Sage: prefers async standups
- Vex: caffeine-driven
- ACTUALLY EVERYONE LOVES STANDUPS DON'T LISTEN TO THE LIES
EOF

# Index mess for `git reset`: stage a scratch file.
cat > scratch.txt <<'EOF'
TODO delete this before commit
TODO delete this before commit
EOF
git add scratch.txt

exit 0
