#!/usr/bin/env bash
# Mission 03.05 validator - runs every 2s. All three checks observe real
# cluster state.

set +e

mkdir -p /tmp/.cosmos
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"

mark()   { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# created_configmap - ConfigMap `cosmos-config` exists.
if ! done_q created_configmap; then
  if kubectl get configmap/cosmos-config >/dev/null 2>&1; then
    mark created_configmap
  fi
fi

# created_secret - Secret `cosmos-secret` exists.
if ! done_q created_secret; then
  if kubectl get secret/cosmos-secret >/dev/null 2>&1; then
    mark created_secret
  fi
fi

# mounted_in_pod - at least one pod in the default namespace has a container
# whose envFrom OR env references the ConfigMap `cosmos-config`. Accept either
# wiring style - both are correct.
if ! done_q mounted_in_pod; then
  # envFrom.configMapRef.name path
  hit=$(kubectl get pods -o jsonpath='{range .items[*]}{range .spec.containers[*]}{range .envFrom[*]}{.configMapRef.name}{"\n"}{end}{end}{end}' 2>/dev/null \
        | grep -Fxq cosmos-config && echo yes || echo no)
  if [ "$hit" = "yes" ]; then
    mark mounted_in_pod
  else
    # env[*].valueFrom.configMapKeyRef.name path
    hit2=$(kubectl get pods -o jsonpath='{range .items[*]}{range .spec.containers[*]}{range .env[*]}{.valueFrom.configMapKeyRef.name}{"\n"}{end}{end}{end}' 2>/dev/null \
           | grep -Fxq cosmos-config && echo yes || echo no)
    if [ "$hit2" = "yes" ]; then
      mark mounted_in_pod
    else
      # volumes[*].configMap.name path (mounted as files, also valid)
      hit3=$(kubectl get pods -o jsonpath='{range .items[*]}{range .spec.volumes[*]}{.configMap.name}{"\n"}{end}{end}' 2>/dev/null \
             | grep -Fxq cosmos-config && echo yes || echo no)
      if [ "$hit3" = "yes" ]; then
        mark mounted_in_pod
      fi
    fi
  fi
fi

exit 0
