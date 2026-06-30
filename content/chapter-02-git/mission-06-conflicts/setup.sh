#!/usr/bin/env bash
# Mission 02.06 setup - engineers a guaranteed conflict scenario.
#
# Steps:
#   1. Reset /srv/repos/cosmos-conflicts.git from the pristine snapshot
#      (which already contains: an "initial roster" commit, a "baseline
#      pilots manifest" tagged `player-start`, and a divergent "Add
#      Captain Q" commit on top of main).
#   2. Wipe ~/work/cosmos-conflicts.
#   3. Clone the bare into ~/work/cosmos-conflicts.
#   4. Hard-reset local main to the `player-start` tag - i.e. one commit
#      *behind* origin/main. The player won't see the "Captain Q" commit
#      until they fetch.
#   5. Pre-edit manifest.txt locally so the player has a real, conflicting
#      change ready to commit. Their edit touches the same line as the
#      remote's "Captain Q" commit, guaranteeing a real conflict on pull.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/committed_change \
      /tmp/.cosmos/hit_rejection \
      /tmp/.cosmos/resolved_conflict \
      /tmp/.cosmos/pushed_resolution

# 1. Reset bare from snapshot.
if [ -d /srv/repos/.snapshots/cosmos-conflicts.git ]; then
  rm -rf /srv/repos/cosmos-conflicts.git
  cp -a /srv/repos/.snapshots/cosmos-conflicts.git /srv/repos/cosmos-conflicts.git
fi

# 2 + 3. Clone fresh.
mkdir -p "$HOME/work"
rm -rf "$HOME/work/cosmos-conflicts"
git clone -q file:///srv/repos/cosmos-conflicts.git "$HOME/work/cosmos-conflicts"

cd "$HOME/work/cosmos-conflicts"

# 4. Rewind local main to player-start so origin/main is one commit ahead.
git reset -q --hard player-start

# 5. Pre-stage a conflicting working-tree change. We append a new pilot row
#    that lands on the *same* trailing line the remote's "Captain Q" commit
#    appended to. (Both edits add a different name as the new last row,
#    which is a textbook conflict - same anchor, divergent content.)
cat > manifest.txt <<'EOF'
# Pilots manifest - one row per pilot.
# Format: callsign | ship | rotation
Sage      | Falcon-1 | A
Vex       | Falcon-2 | A
Doc Lina  | Medic-1  | B
Storm     | Falcon-4 | A
EOF

exit 0
