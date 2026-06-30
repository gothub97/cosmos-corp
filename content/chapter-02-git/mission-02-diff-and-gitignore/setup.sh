#!/usr/bin/env bash
# Mission 02.02 setup - leaves the player with:
#   • An initialised repo containing one initial commit (notes.md + roster.txt).
#   • A pre-made working-tree edit on notes.md (typo fix), so `git diff`
#     immediately shows something interesting without the player needing
#     to open an editor.
#   • Two pieces of "noise" they should add to .gitignore:
#       - secrets.env       (a fake environment file)
#       - build/output.log  (a fake build artifact)
#
# Idempotent: nukes ~/work/repo and re-seeds.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/ran_diff \
      /tmp/.cosmos/created_gitignore \
      /tmp/.cosmos/ignored_extras \
      /tmp/.cosmos/committed_change

mkdir -p "$HOME/work"
rm -rf "$HOME/work/repo"
mkdir -p "$HOME/work/repo"
cd "$HOME/work/repo"

git init -q -b main

# Baseline files for the initial commit. notes.md has an intentional typo
# we'll "fix" in the working tree afterwards.
cat > notes.md <<'EOF'
# Cosmos Corp - Crew Notes

- Sage takes coffeee black. Important.
- Captain Vex wants weekly status updates on Fridays.
EOF
cat > roster.txt <<'EOF'
Sage         - SRE, mentor
Captain Vex  - VPE
Doc Lina     - IC
Daymari      - IC (you)
EOF

git add notes.md roster.txt
git commit -q -m "Initial roster"

# Now make the working-tree edit. The player will see this with `git diff`.
sed -i 's/coffeee/coffee/' notes.md

# Drop the "noise" files the player will need to ignore.
cat > secrets.env <<'EOF'
# DO NOT COMMIT.
COSMOS_API_TOKEN=tk_live_donotleakthis
DATABASE_URL=postgres://cosmos:hunter2@db.cosmos.corp/prod
EOF
mkdir -p build
cat > build/output.log <<'EOF'
[2099-01-01 00:00:00] build started
[2099-01-01 00:00:01] step: lint   ok
[2099-01-01 00:00:02] step: bundle ok
[2099-01-01 00:00:03] build complete (3.2s)
EOF

exit 0
