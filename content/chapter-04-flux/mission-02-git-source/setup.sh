#!/usr/bin/env bash
# Mission 04.02 setup - the player creates the GitRepository source from
# scratch, so we tear down any source/kustomization/app from a prior attempt
# and reset the deploy repo to its baseline (replicas: 2). Idempotent.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/created_source \
      /tmp/.cosmos/source_ready \
      /tmp/.cosmos/listed_sources

export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"

WORK=/home/dev/work/cosmos-deploy
BARE=/srv/repos/cosmos-deploy.git

# ── Wait for the API + Flux controllers (they pull images on first boot) ──────
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

# ── Tear down Flux objects + the app so the player starts from nothing ────────
flux delete kustomization cosmos-web -n default --silent >/dev/null 2>&1 || true
flux delete source git cosmos-deploy -n default --silent >/dev/null 2>&1 || true
kubectl delete deploy/cosmos-web -n default --ignore-not-found --wait=false >/dev/null 2>&1 || true
kubectl delete svc/cosmos-web -n default --ignore-not-found --wait=false >/dev/null 2>&1 || true

cd "$HOME"
exit 0
