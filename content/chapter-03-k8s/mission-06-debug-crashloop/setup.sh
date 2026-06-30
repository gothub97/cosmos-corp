#!/usr/bin/env bash
# Mission 03.06 setup - apply the intentionally-broken Deployment so the
# player has something stuck to debug. Idempotent: clears any prior state and
# re-applies the seed.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/described_broken \
      /tmp/.cosmos/viewed_broken_logs \
      /tmp/.cosmos/fixed_image

export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"
SEED=/home/dev/manifests/broken-deployment.yaml

# Wait for the API.
for _ in $(seq 1 60); do
  if kubectl get nodes >/dev/null 2>&1; then break; fi
  sleep 1
done

# Tear down any lingering version of `broken` so re-applying with the bad tag
# always lands the player in the failing state.
kubectl delete deploy/broken --ignore-not-found --wait=true >/dev/null 2>&1 || true

# (Re-)apply the broken seed. The image tag in the file is intentionally
# nonsense - kubelet will hit ImagePullBackOff. The cluster view will paint
# the pod red.
if [ -f "$SEED" ]; then
  kubectl apply -f "$SEED" >/dev/null
else
  # Fallback: build the broken Deployment inline if the seed file is missing
  # (shouldn't happen - the lab image bakes it in - but defensive).
  cat <<'EOF' | kubectl apply -f - >/dev/null
apiVersion: apps/v1
kind: Deployment
metadata:
  name: broken
  labels:
    app: broken
    mission: ch03-m06
spec:
  replicas: 1
  selector:
    matchLabels:
      app: broken
  template:
    metadata:
      labels:
        app: broken
        mission: ch03-m06
    spec:
      containers:
        - name: web
          image: nginx:cosmos-broken-do-not-exist
          ports:
            - containerPort: 80
EOF
fi

cd "$HOME"
exit 0
