#!/usr/bin/env bash
# Mission 04.04 setup - the player drives the full loop, so we hand them a
# WORKING loop at baseline: source + Kustomization + app live at replicas 2,
# the bare repo's main back at replicas 2, and the working clone reset so the
# file reads `replicas: 2` at mission start. Idempotent.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/edited_and_pushed \
      /tmp/.cosmos/reconciled \
      /tmp/.cosmos/scaled_pods_ready

export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"

WORK=/home/dev/work/cosmos-deploy
BARE=/srv/repos/cosmos-deploy.git
GIT_URL=http://git-server.git-system.svc.cluster.local/cosmos-deploy.git

# ── Wait for the API + Flux controllers ──────────────────────────────────────
for _ in $(seq 1 120); do
  if kubectl get nodes >/dev/null 2>&1; then break; fi
  sleep 1
done
for _ in $(seq 1 180); do
  sc=$(kubectl -n flux-system get deploy source-controller \
        -o jsonpath='{.status.availableReplicas}' 2>/dev/null || true)
  kc=$(kubectl -n flux-system get deploy kustomize-controller \
        -o jsonpath='{.status.availableReplicas}' 2>/dev/null || true)
  if [ "${sc:-0}" -ge 1 ] 2>/dev/null && [ "${kc:-0}" -ge 1 ] 2>/dev/null; then break; fi
  sleep 1
done

# ── Reset the deploy repo (bare + working clone) to baseline replicas: 2 ──────
rm -rf "$WORK"
git clone -q "$BARE" "$WORK"
git -C "$WORK" config user.email "dev@cosmos.local"
git -C "$WORK" config user.name "Cosmos Dev"
cat > "$WORK/deploy/cosmos-web.yaml" <<EOF
# Cosmos Corp web frontend - the app Flux keeps in sync with this repo.
# THIS FILE IS THE SOURCE OF TRUTH. Edit it, commit, push, and Flux reconciles
# the live cluster to match.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cosmos-web
  namespace: default
  labels:
    app: cosmos-web
spec:
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
git -C "$WORK" add -A
git -C "$WORK" diff --cached --quiet || git -C "$WORK" commit -q -m "reset baseline (replicas: 2)"
git -C "$WORK" push -q --force origin main

# ── Ensure source + Kustomization + app exist, at baseline replicas 2 ─────────
flux create source git cosmos-deploy \
  --url="$GIT_URL" --branch=main --interval=1m -n default >/dev/null 2>&1 || true
flux create kustomization cosmos-web \
  --source=GitRepository/cosmos-deploy \
  --path=./deploy --prune=true --interval=1m -n default >/dev/null 2>&1 || true
# Re-fetch + re-apply so the live app matches the freshly-reset baseline.
flux reconcile kustomization cosmos-web --with-source -n default >/dev/null 2>&1 || true

# Give the Deployment a moment to settle at 2 available replicas so the player
# starts from a steady state.
for _ in $(seq 1 60); do
  avail=$(kubectl -n default get deploy cosmos-web \
           -o jsonpath='{.status.availableReplicas}' 2>/dev/null || true)
  if [ "${avail:-0}" -ge 2 ] 2>/dev/null; then break; fi
  sleep 1
done

cd "$HOME"
exit 0
