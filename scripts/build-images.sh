#!/usr/bin/env bash
# Build the Cosmos Corp lab images that ship with the game.
#
# Usage:
#   bash scripts/build-images.sh                # build everything that exists
#   bash scripts/build-images.sh terminal-base  # build a specific image only
#
# Tags follow `cosmos/<name>:latest`. The Rust validator and `start_mission`
# look up images by these names - keep them in sync with the YAML
# `container_image` field.

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
LAB_DIR="$ROOT/lab-images"

# --- helpers ------------------------------------------------------------------

color() { printf '\033[%sm%s\033[0m\n' "$1" "$2"; }
info()  { color "1;36" "→ $*"; }
ok()    { color "1;32" "✓ $*"; }
warn()  { color "1;33" "! $*"; }
err()   { color "1;31" "✗ $*"; }

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    err "docker CLI not found. Install Docker Desktop or Colima first."
    exit 127
  fi
  if ! docker info >/dev/null 2>&1; then
    err "docker daemon is not running. Start Docker Desktop / Colima and retry."
    exit 1
  fi
}

build_one() {
  local name="$1"
  local dir="$LAB_DIR/$name"
  local tag="cosmos/${name}:latest"

  if [[ ! -f "$dir/Dockerfile" ]]; then
    warn "skipping $name (no Dockerfile at $dir/Dockerfile)"
    return 0
  fi

  info "building $tag from $dir"
  # `--pull` keeps the base image fresh so security patches land on rebuild.
  # `--progress=plain` makes CI logs readable; locally docker auto-detects tty.
  docker build \
    --pull \
    --progress=plain \
    --tag "$tag" \
    --file "$dir/Dockerfile" \
    "$dir"
  ok "built $tag"
}

# --- main ---------------------------------------------------------------------

ensure_docker

if [[ $# -gt 0 ]]; then
  for name in "$@"; do
    build_one "$name"
  done
else
  # Discover images by directory. Build in stable order so logs are predictable.
  shopt -s nullglob
  for entry in "$LAB_DIR"/*/; do
    name="$(basename "$entry")"
    build_one "$name"
  done
fi

ok "all requested images built."
