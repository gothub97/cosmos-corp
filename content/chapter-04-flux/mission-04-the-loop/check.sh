#!/usr/bin/env bash
# Mission 04.04 validator - runs every 2s.
#   edited_and_pushed → REAL state: the BARE repo's main now declares replicas: 3
#                       (i.e. the player committed AND pushed the change).
#   reconciled        → REAL state: the live Deployment's desired replicas is 3
#                       (Flux pulled the commit and re-applied it).
#   scaled_pods_ready → REAL state: 3 pods are available.

set +e

mkdir -p /tmp/.cosmos
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"
BARE=/srv/repos/cosmos-deploy.git

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# edited_and_pushed - the pushed manifest on main declares replicas: 3. We read
# straight from the bare repo so this only trips after a real `git push`.
if ! done_q edited_and_pushed; then
  if git -C "$BARE" show main:deploy/cosmos-web.yaml 2>/dev/null \
       | grep -Eq '^[[:space:]]*replicas:[[:space:]]*3[[:space:]]*$'; then
    mark edited_and_pushed
  fi
fi

# reconciled - the live Deployment's desired (spec) replica count is 3. This
# only becomes true once Flux re-fetches + re-applies the new commit.
if ! done_q reconciled; then
  spec=$(kubectl -n default get deploy cosmos-web \
          -o jsonpath='{.spec.replicas}' 2>/dev/null)
  if [ "$spec" = "3" ]; then
    mark reconciled
  fi
fi

# scaled_pods_ready - 3 pods are available (the cluster caught up).
if ! done_q scaled_pods_ready; then
  avail=$(kubectl -n default get deploy cosmos-web \
           -o jsonpath='{.status.availableReplicas}' 2>/dev/null)
  if [ "${avail:-0}" = "3" ]; then
    mark scaled_pods_ready
  fi
fi

exit 0
