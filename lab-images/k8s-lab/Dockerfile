# cosmos/k8s-lab:latest
# Sandbox image for Chapter 3 (Kubernetes). A single-node k3s cluster running as
# PID 1 inside a privileged container, exposing real `kubectl` to the player.
#
# Conventions mirror terminal-base + git-lab:
#   - debian:bookworm-slim base
#   - dev user, uid 1000 (the player's shell - orchestrator does `docker exec -u dev`)
#   - /tmp/.cosmos/ marker dir, owned by dev, used by check.sh validators
#   - PROMPT_COMMAND="history -a" so check.sh can grep ~/.bash_history
#
# Why root by default + privileged at run time?
#   k3s needs to mount cgroups and create network namespaces - both require root
#   inside the container *and* the docker run flag --privileged. The orchestrator
#   knows to set that flag for cosmos/k8s-lab specifically. Player shells are
#   still attached as `dev` (uid 1000) so muscle memory matches a normal box.

FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# Toolset:
#   bash, coreutils, findutils, grep, sed, gawk → terminal baseline
#   less, vim, nano                             → for kubectl edit / inspecting yaml
#   man-db, manpages                            → `man kubectl` etc.
#   procps, util-linux, psmisc                  → ps/kill/mount used by k3s + tutorials
#   tree, jq                                    → handy in dialogue / hints
#   ca-certificates, curl                       → fetching k3s installer + image pulls
#   iptables, iproute2, conntrack, ipset,
#   socat, kmod                                 → k3s networking deps
#   ethtool, mount                              → k3s prereqs on slim images
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        bash \
        coreutils \
        findutils \
        grep \
        sed \
        gawk \
        less \
        vim \
        nano \
        man-db \
        manpages \
        procps \
        util-linux \
        psmisc \
        tree \
        jq \
        ca-certificates \
        curl \
        iptables \
        iproute2 \
        conntrack \
        ipset \
        socat \
        ethtool \
        kmod \
 && rm -rf /var/lib/apt/lists/*

# Re-enable man pages - debian-slim disables them by default via dpkg config.
RUN sed -i '/path-exclude=\/usr\/share\/man/d' /etc/dpkg/dpkg.cfg.d/docker || true \
 && sed -i '/path-exclude=\/usr\/share\/doc/d' /etc/dpkg/dpkg.cfg.d/docker || true

# Install k3s by direct binary download. The official `get.k3s.io` installer
# fails on this image because its `verify_system()` step *requires* systemd
# (or openrc) on PATH and exits early - even with `INSTALL_K3S_SKIP_START`
# and `INSTALL_K3S_SKIP_ENABLE` set, which only skip *using* it. The k3s
# binary itself is fully self-contained, so we grab it directly. Pinning the
# version keeps image builds reproducible.
ARG K3S_VERSION=v1.31.5+k3s1
RUN set -eux \
 && ARCH="$(dpkg --print-architecture)" \
 && case "$ARCH" in \
      amd64) K3S_BIN_NAME="k3s" ;; \
      arm64) K3S_BIN_NAME="k3s-arm64" ;; \
      *)     echo "unsupported architecture: $ARCH" >&2; exit 1 ;; \
    esac \
 && K3S_VERSION_URL="$(printf '%s' "$K3S_VERSION" | sed 's/+/%2B/')" \
 && curl -fL --retry 3 \
      "https://github.com/k3s-io/k3s/releases/download/${K3S_VERSION_URL}/${K3S_BIN_NAME}" \
      -o /usr/local/bin/k3s \
 && chmod 0755 /usr/local/bin/k3s \
 && ln -sf /usr/local/bin/k3s /usr/local/bin/kubectl \
 && ln -sf /usr/local/bin/k3s /usr/local/bin/crictl \
 && ln -sf /usr/local/bin/k3s /usr/local/bin/ctr

# Create the player. uid 1000 matches typical macOS host uid mapping.
RUN useradd --create-home --shell /bin/bash --uid 1000 dev

# Marker directory + dev's kube + manifests. Single RUN so the chown applies to
# everything in one layer.
RUN mkdir -p /tmp/.cosmos /home/dev/.kube /home/dev/manifests \
 && chown -R dev:dev /tmp/.cosmos /home/dev \
 && chmod 0755 /tmp/.cosmos

# Drop the friendly bash setup.
COPY --chown=dev:dev bashrc       /home/dev/.bashrc
COPY --chown=dev:dev bash_profile /home/dev/.bash_profile

# Pre-seed reference manifests under /home/dev/manifests/. Missions reference
# them by name; m06 in particular asks the player to fix broken-deployment.yaml.
COPY --chown=dev:dev manifests/   /home/dev/manifests/

# Entrypoint script - starts k3s, waits for the API, copies kubeconfig to dev,
# then sleeps forever so the orchestrator can `docker exec` into it.
COPY --chown=root:root cosmos-k8s-entry.sh /usr/local/bin/cosmos-k8s-entry.sh
RUN chmod 0755 /usr/local/bin/cosmos-k8s-entry.sh

# Default WORKDIR - dev's home so orchestrator-launched shells start there.
WORKDIR /home/dev

ENV HOME=/home/dev \
    SHELL=/bin/bash \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    TERM=xterm-256color \
    HISTFILE=/home/dev/.bash_history \
    HISTSIZE=2000 \
    HISTFILESIZE=5000 \
    PROMPT_COMMAND="history -a" \
    EDITOR=nano \
    KUBE_EDITOR=nano \
    KUBECONFIG=/home/dev/.kube/config

# IMPORTANT: USER stays root. k3s needs root to mount cgroups, manage iptables,
# create veth pairs, etc. Player shells are explicitly attached as `dev` by
# the orchestrator via `docker exec -u dev`.

ENTRYPOINT ["/usr/local/bin/cosmos-k8s-entry.sh"]
