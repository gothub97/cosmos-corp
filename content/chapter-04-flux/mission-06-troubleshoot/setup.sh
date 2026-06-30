#!/usr/bin/env bash
# Mission 04.06 setup - sabotage the deploy repo so the player lands in a
# broken-and-red state to diagnose. Pushes a manifest whose container image tag
# doesn't exist; the Kustomization is created with health checks (`wait: true`)
# so the bad image surfaces as a RED Kustomization, not a silently-applied dud.
# The player's working clone is reset to the broken state so they can fix it.
# Idempotent.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/found_failure \
      /tmp/.cosmos/fixed_and_pushed \
      /tmp/.cosmos/healthy_again

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

# ── Reset the deploy repo (bare + working clone) to a BROKEN manifest ─────────
# The image tag `nginx:DOESNOTEXIST` will never pull - that's the bug to find.
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
          # BUG: this image tag does not exist - kubelet hits ImagePullBackOff.
          image: nginx:DOESNOTEXIST
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
git -C "$WORK" diff --cached --quiet || git -C "$WORK" commit -q -m "deploy cosmos-web (BROKEN image tag)"
git -C "$WORK" push -q --force origin main

# ── Ensure the source exists and has fetched the broken commit ───────────────
flux create source git cosmos-deploy \
  --url="$GIT_URL" --branch=main --interval=1m -n default >/dev/null 2>&1 || true
flux reconcile source git cosmos-deploy -n default >/dev/null 2>&1 || true

# ── Recreate the Kustomization from scratch with health checks enabled ───────
# Deleting first (prune=true on the old one) clears any healthy app so the
# broken state is unambiguous. We apply the CR directly (rather than `flux
# create … --wait`, which would block this script) so setup stays snappy.
flux delete kustomization cosmos-web -n default --silent >/dev/null 2>&1 || true
kubectl delete deploy/cosmos-web -n default --ignore-not-found --wait=true >/dev/null 2>&1 || true
kubectl delete svc/cosmos-web -n default --ignore-not-found --wait=false >/dev/null 2>&1 || true

kubectl apply -f - >/dev/null 2>&1 <<'EOF'
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: cosmos-web
  namespace: default
spec:
  interval: 1m
  retryInterval: 20s
  timeout: 30s
  wait: true
  prune: true
  path: ./deploy
  sourceRef:
    kind: GitRepository
    name: cosmos-deploy
EOF

# Trigger an immediate reconcile WITHOUT blocking (the controller will apply the
# broken manifest, health-check it, and report Ready=False after the timeout).
kubectl -n default annotate kustomization cosmos-web \
  "reconcile.fluxcd.io/requestedAt=$(date +%s)" --overwrite >/dev/null 2>&1 || true

cd "$HOME"
exit 0
