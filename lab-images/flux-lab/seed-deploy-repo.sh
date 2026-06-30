#!/usr/bin/env bash
# Seed the bare GitOps repo that Chapter 4 revolves around.
#
# Runs once at image-BUILD time (from the Dockerfile). Produces:
#   /srv/repos/cosmos-deploy.git   - a bare repo on branch `main`, containing
#                                    deploy/cosmos-web.yaml (the app manifest).
#
# The git baseline is the source of truth the player drives:
#   - Deployment `cosmos-web`, namespace default, replicas: 2, image nginx:alpine
#   - a matching ClusterIP Service `cosmos-web`
#
# Two things make this repo usable by Flux's in-cluster source-controller over
# dumb-HTTP (served by the git-server pod, which mounts /srv/repos):
#   1. The bare repo's hooks/post-update runs `git update-server-info`, so after
#      every push the dumb-HTTP "info/refs" + "objects/info/packs" files are
#      regenerated and the server sees the new refs.
#   2. We run `git update-server-info` once here so the freshly-seeded repo is
#      cloneable even before the first player push.
#
# The player's working clone (created by each mission's setup.sh) uses the local
# filesystem path as its origin, so `git push` is a plain filesystem push - no
# auth, no network. The post-update hook then refreshes the dumb-HTTP view that
# source-controller reads.

set -euo pipefail

BARE=/srv/repos/cosmos-deploy.git
WORKTREE="$(mktemp -d)"

# A throwaway identity so `git commit` succeeds during the image build. Set
# globally for the build user (root); the player gets their own identity in
# their working clone via setup.sh.
export GIT_AUTHOR_NAME="Cosmos Seed"
export GIT_AUTHOR_EMAIL="seed@cosmos.local"
export GIT_COMMITTER_NAME="Cosmos Seed"
export GIT_COMMITTER_EMAIL="seed@cosmos.local"

# ── 1. Init the bare repo ────────────────────────────────────────────────────
rm -rf "$BARE"
git init --bare --initial-branch=main "$BARE"

# ── 2. Build the initial commit in a temp worktree ───────────────────────────
git init --initial-branch=main "$WORKTREE"
mkdir -p "$WORKTREE/deploy"

cat > "$WORKTREE/deploy/cosmos-web.yaml" <<'EOF'
# Cosmos Corp web frontend - the app Flux keeps in sync with this repo.
#
# THIS FILE IS THE SOURCE OF TRUTH. Edit it, commit, push, and Flux's
# kustomize-controller reconciles the live cluster to match. Don't `kubectl
# edit` the running Deployment to make a lasting change - Flux will revert it
# on the next reconcile (you'll prove that to yourself in the self-heal
# mission). Change it HERE instead.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cosmos-web
  namespace: default
  labels:
    app: cosmos-web
spec:
  # The git baseline: two replicas. Change this number, push, and watch the
  # cluster follow.
  replicas: 2
  selector:
    matchLabels:
      app: cosmos-web
  template:
    metadata:
      labels:
        app: cosmos-web
    spec:
      containers:
        - name: web
          image: nginx:alpine
          ports:
            - containerPort: 80
          readinessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 2
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: cosmos-web
  namespace: default
  labels:
    app: cosmos-web
spec:
  type: ClusterIP
  selector:
    app: cosmos-web
  ports:
    - name: http
      port: 80
      targetPort: 80
      protocol: TCP
EOF

git -C "$WORKTREE" add -A
git -C "$WORKTREE" commit -m "Initial cosmos-web deployment (replicas: 2)"
git -C "$WORKTREE" remote add origin "$BARE"
git -C "$WORKTREE" push origin main

# ── 3. Enable the dumb-HTTP post-update hook ─────────────────────────────────
# Sample hook ships as hooks/post-update.sample; activate our own minimal one.
cat > "$BARE/hooks/post-update" <<'EOF'
#!/bin/sh
# Refresh dumb-HTTP server info after each push so nginx (and therefore Flux's
# source-controller) sees the new refs without a smart-HTTP backend.
exec git update-server-info
EOF
chmod +x "$BARE/hooks/post-update"

# ── 4. Prime the dumb-HTTP view for the very first clone ─────────────────────
git -C "$BARE" update-server-info

# ── 5. Make sure nginx (running as a non-root user in the pod) can read it ───
chmod -R a+rX "$BARE"

rm -rf "$WORKTREE"
echo "[seed] cosmos-deploy.git seeded at $BARE (branch main, replicas: 2)"
