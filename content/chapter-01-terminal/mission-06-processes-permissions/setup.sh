#!/usr/bin/env bash
# Mission 06 setup - spawns a long-running `sleep` and seeds a non-executable
# script for chmod practice. Idempotent: kills any prior sleeper before starting
# a new one so the player only sees the one we control.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/listed_processes \
      /tmp/.cosmos/killed_sleeper \
      /tmp/.cosmos/made_executable

# Kill any previously-spawned mission-06 sleepers so we start clean.
pkill -u "$(id -u)" -f 'sleep 9999' 2>/dev/null || true

# Re-seed the work directory.
mkdir -p "$HOME/work"
cat > "$HOME/work/deploy.sh" <<'EOF'
#!/usr/bin/env bash
# Pretend deploy script. Mission 06 wants you to make this executable.
echo "deploying cosmos-api…"
EOF
# Explicitly clear executable bits so the player has something to fix.
chmod 0644 "$HOME/work/deploy.sh"

# Spawn the long-running background process. nohup + setsid + redirecting all
# fds means it survives the validator and doesn't print into the player's
# terminal. The marker `sleep 9999` makes it easy to find with `ps | grep sleep`.
( setsid bash -c 'exec -a "cosmos-sleeper" sleep 9999' </dev/null >/dev/null 2>&1 & )

cd "$HOME"
exit 0
