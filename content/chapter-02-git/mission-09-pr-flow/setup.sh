#!/usr/bin/env bash
# Mission 02.09 setup - full PR-style loop.
#
# Steps:
#   1. Reset /srv/repos/cosmos.git from the pristine snapshot.
#   2. Pre-publish a fake "automated review bot" branch on the bare so that
#      when the player runs `git fetch` after pushing their feature, they
#      see actionable feedback in `origin/review-bot/handbook-feedback`.
#   3. Wipe ~/work/cosmos and clone fresh. Land on `main`.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/created_feature_branch \
      /tmp/.cosmos/pushed_feature \
      /tmp/.cosmos/fetched_review \
      /tmp/.cosmos/addressed_review \
      /tmp/.cosmos/pushed_revision

# 1. Reset bare from snapshot.
if [ -d /srv/repos/.snapshots/cosmos.git ]; then
  rm -rf /srv/repos/cosmos.git
  cp -a /srv/repos/.snapshots/cosmos.git /srv/repos/cosmos.git
fi

# 2. Pre-publish the review-bot branch on the bare via a temp clone. We use
#    a temp clone (not the player's ~/work clone) so the player's clone is
#    pristine and they have to fetch to discover the review branch.
SETUP_WORK=$(mktemp -d)
trap 'rm -rf "$SETUP_WORK"' EXIT

git clone -q file:///srv/repos/cosmos.git "$SETUP_WORK/cosmos"
cd "$SETUP_WORK/cosmos"
git switch -q -c review-bot/handbook-feedback main
cat > REVIEW.md <<'EOF'
# Review notes - feature/handbook-update

Hey Daymari! Automated reviewer bot here. Quick ask before we merge your
handbook change:

- [ ] Add a `## Conventions` section to `docs/handbook.md`.
- [ ] At least one bullet point under it (style guidance is fine).

LGTM otherwise - push the update and I'll re-check.

- @cosmos-review-bot
EOF
git -c user.name="Cosmos Review Bot" -c user.email="bot@cosmos.corp" \
    add REVIEW.md
git -c user.name="Cosmos Review Bot" -c user.email="bot@cosmos.corp" \
    commit -q -m "Reviewer notes for handbook update"
git push -q origin review-bot/handbook-feedback

# 3. Player's clone.
mkdir -p "$HOME/work"
rm -rf "$HOME/work/cosmos"
git clone -q file:///srv/repos/cosmos.git "$HOME/work/cosmos"
cd "$HOME/work/cosmos"
# Make sure we land on main, not on review-bot/...
git switch -q main 2>/dev/null || true

exit 0
