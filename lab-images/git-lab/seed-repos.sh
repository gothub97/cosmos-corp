#!/usr/bin/env bash
# Build the bare seed repos under /srv/repos/. Runs ONCE during `docker build`
# as the dev user (so all objects are owned by uid 1000 - the player can push
# back without permission errors).
#
# Two repos are created:
#   /srv/repos/cosmos.git
#     A small repo with a single initial commit on `main`. Used by missions
#     05 (clone / push / pull) and 09 (PR flow).
#
#   /srv/repos/cosmos-conflicts.git
#     A repo whose `main` branch has been advanced *after* the snapshot the
#     player will start from. Mission 06 has the player clone, make a local
#     change, try to push, hit the rejected-non-fast-forward error, pull
#     (which produces a real merge conflict), resolve, and push.

set -euo pipefail

REPOS=/srv/repos
WORK=/tmp/seed-work
mkdir -p "$REPOS" "$WORK"

# Make sure git can find a name/email even though the system gitconfig isn't
# inherited during the build user switch on every base image.
export GIT_AUTHOR_NAME="Cosmos Bootstrapper"
export GIT_AUTHOR_EMAIL="bootstrap@cosmos.corp"
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"

# Anchor every commit to the same date so image builds are reproducible.
export GIT_AUTHOR_DATE="2099-01-01T00:00:00Z"
export GIT_COMMITTER_DATE="$GIT_AUTHOR_DATE"

# ─────────────────────────────────────────────────────────────────────────────
# 1. cosmos.git - one clean initial commit.
# ─────────────────────────────────────────────────────────────────────────────
mkdir -p "$WORK/cosmos"
cd "$WORK/cosmos"
git init -q -b main .
cat > README.md <<'EOF'
# Cosmos Corp Handbook

Welcome to the Cosmos Corp shared handbook repo.
This is the canonical home for crew notes, runbooks, and anything else
that should outlive a single laptop.

## Conventions
- One topic per file.
- Use Markdown. Keep lines under 100 chars.
- Open a branch for any change you're not 100% sure about.
EOF
mkdir -p docs
cat > docs/getting-started.md <<'EOF'
# Getting started

If you're reading this, congrats - you've successfully cloned the handbook.
Next steps:
1. Add yourself to `crew.txt`.
2. Skim the runbooks under `docs/`.
3. Open a PR with anything you'd improve.
EOF
cat > crew.txt <<'EOF'
Sage         - SRE, mentor
Captain Vex  - VPE
Doc Lina     - IC
EOF
git add .
git -c user.name="Cosmos Bootstrapper" -c user.email="bootstrap@cosmos.corp" \
    commit -q -m "Initial handbook"

git clone -q --bare "$WORK/cosmos" "$REPOS/cosmos.git"

# ─────────────────────────────────────────────────────────────────────────────
# 2. cosmos-conflicts.git - pre-built so mission 06 hits a *real* conflict.
#    Strategy:
#      a. Build the repo with two commits on main: an initial README and a
#         baseline `manifest.txt` listing the pilots roster.
#      b. Take a snapshot at this state - that's the commit the player will
#         clone (mission 06 setup.sh resets the player's clone to it).
#      c. On the bare repo, advance `main` by one more commit that *also*
#         touches `manifest.txt`. The player won't see this commit until they
#         `git fetch`, and trying to push their own change to manifest.txt
#         will be rejected.
#      d. We tag the player's starting point as `player-start` so the
#         per-mission setup.sh can reset their clone without guessing the SHA.
# ─────────────────────────────────────────────────────────────────────────────
mkdir -p "$WORK/cosmos-conflicts"
cd "$WORK/cosmos-conflicts"
git init -q -b main .
cat > README.md <<'EOF'
# Pilots Roster

Source of truth for who's flying what this rotation.
Update `manifest.txt` to claim a slot.
EOF
git add README.md
git -c user.name="Cosmos Bootstrapper" -c user.email="bootstrap@cosmos.corp" \
    commit -q -m "Initial roster scaffold"

cat > manifest.txt <<'EOF'
# Pilots manifest - one row per pilot.
# Format: callsign | ship | rotation
Sage      | Falcon-1 | A
Vex       | Falcon-2 | A
Doc Lina  | Medic-1  | B
EOF
git add manifest.txt
git -c user.name="Cosmos Bootstrapper" -c user.email="bootstrap@cosmos.corp" \
    commit -q -m "Add baseline pilots manifest"

# Tag this as the player's starting point. setup.sh resets the player's local
# clone to this tag so they always start mission 06 from the same place.
git tag player-start

# Now advance `main` with a divergent change to manifest.txt - this is what
# the player won't have, and what causes their push to be rejected.
cat > manifest.txt <<'EOF'
# Pilots manifest - one row per pilot.
# Format: callsign | ship | rotation
Sage      | Falcon-1 | A
Vex       | Falcon-2 | A
Doc Lina  | Medic-1  | B
Captain Q | Falcon-3 | A
EOF
git add manifest.txt
git -c user.name="Cosmos Bootstrapper" -c user.email="bootstrap@cosmos.corp" \
    commit -q -m "Add Captain Q to rotation A"

# Push to a bare so the player can clone over file://.
git clone -q --bare "$WORK/cosmos-conflicts" "$REPOS/cosmos-conflicts.git"
# Bare clone copies refs but tags need an explicit push to land in some git
# versions - be defensive.
git -C "$WORK/cosmos-conflicts" push -q --tags "$REPOS/cosmos-conflicts.git" || true

# Bare repos must allow pushes to the currently checked-out branch (which is
# 'main' for HEAD). Bare repos don't have a working tree so this is fine, but
# we set the option explicitly so newer git versions don't complain.
git -C "$REPOS/cosmos.git"          config receive.denyCurrentBranch ignore
git -C "$REPOS/cosmos-conflicts.git" config receive.denyCurrentBranch ignore

# ─────────────────────────────────────────────────────────────────────────────
# Snapshots: pristine copies of every bare repo, used by per-mission setup.sh
# scripts to reset state on retry. Missions push to these bare repos as part
# of teaching push/conflict-resolution; without a clean snapshot to restore
# from, a second playthrough would inherit the previous attempt's commits.
# ─────────────────────────────────────────────────────────────────────────────
mkdir -p "$REPOS/.snapshots"
cp -a "$REPOS/cosmos.git"           "$REPOS/.snapshots/cosmos.git"
cp -a "$REPOS/cosmos-conflicts.git" "$REPOS/.snapshots/cosmos-conflicts.git"

# Cleanup.
rm -rf "$WORK"

ls -la "$REPOS"
echo "seed-repos: done"
