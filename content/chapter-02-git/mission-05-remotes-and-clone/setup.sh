#!/usr/bin/env bash
# Mission 02.05 setup - wipes ~/work and resets /srv/repos/cosmos.git from
# the pristine snapshot baked into the image so the player can always
# reproduce a clean clone state. Idempotent.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/cloned_repo \
      /tmp/.cosmos/listed_remotes \
      /tmp/.cosmos/fetched \
      /tmp/.cosmos/committed_locally \
      /tmp/.cosmos/pushed_to_origin \
      /tmp/.cosmos/pulled

# Reset the player's workspace.
mkdir -p "$HOME/work"
rm -rf "$HOME/work/cosmos"

# Reset the bare repo from the pristine snapshot. The snapshot is owned by
# `dev`, so this works without sudo.
if [ -d /srv/repos/.snapshots/cosmos.git ]; then
  rm -rf /srv/repos/cosmos.git
  cp -a /srv/repos/.snapshots/cosmos.git /srv/repos/cosmos.git
fi

cd "$HOME"
exit 0
