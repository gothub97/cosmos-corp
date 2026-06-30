#!/usr/bin/env bash
# Mission 02.07 setup - repo with a `feature/onboarding` branch carrying
# three intentionally-messy WIP commits ahead of main. Player squashes
# them into one with `git rebase -i HEAD~3`.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/on_feature_branch \
      /tmp/.cosmos/cleaned_history \
      /tmp/.cosmos/confirmed_clean

mkdir -p "$HOME/work"
rm -rf "$HOME/work/repo"
mkdir -p "$HOME/work/repo"
cd "$HOME/work/repo"

git init -q -b main

# Baseline on main.
cat > README.md <<'EOF'
# Cosmos Corp Handbook (mini)

Repo for the rebase practice mission.
EOF
git add README.md
git commit -q -m "Initial scaffold"

# Branch off and start adding the onboarding doc, three messy commits at a time.
git switch -q -c feature/onboarding

cat > onboarding.md <<'EOF'
# Onboarding

ill write the welcome later
EOF
git add onboarding.md
git commit -q -m "wip"

cat > onboarding.md <<'EOF'
# Onboarding

Welcome to Cosmos Corp! Things to do in your first week.

* meet sage
* read the handbook
* push your first comit
EOF
git add onboarding.md
git commit -q -m "more wip"

cat > onboarding.md <<'EOF'
# Onboarding

Welcome to Cosmos Corp! Things to do in your first week.

* meet sage
* read the handbook
* push your first commit
EOF
git add onboarding.md
git commit -q -m "fix typo"

# Land back on main so the player has to switch deliberately.
git switch -q main

exit 0
