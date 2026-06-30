# cosmos/flux-lab:latest
# Sandbox image for Chapter 4 (FluxCD / GitOps). A single-node k3s cluster
# running as PID 1 inside a privileged container - same shape as k8s-lab -
# PLUS the Flux toolkit, a git CLI, and a self-contained git server so the
# whole GitOps loop runs OFFLINE with no external dependencies.
#
# This image is a fork of cosmos/k8s-lab. Everything that file documents about
# why we run k3s as root + privileged, the dev user (uid 1000), the /tmp/.cosmos
# marker dir, and PROMPT_COMMAND="history -a" applies here verbatim. The new
# pieces for Chapter 4:
#   - git                                  → the player commits + pushes manifests
#   - flux CLI                             → `flux create`, `flux reconcile`, …
#   - /srv/repos/cosmos-deploy.git         → a BARE repo seeded at build time;
#                                            the player's working clone pushes
#                                            here over the local filesystem
#                                            (no auth, no network).
#   - git-server.yaml                      → an in-cluster nginx pod that serves
#                                            /srv/repos over dumb-HTTP so Flux's
#                                            source-controller (which lives in
#                                            the cluster) can clone it.
#
# Why the in-cluster git server? Flux's source-controller runs as a pod, so the
# git URL it clones must be CLUSTER-routable. A `localhost` path won't do. We
# mount the node's /srv/repos into an nginx pod via hostPath and serve it as
# static files; the bare repo + `git update-server-info` makes those files
# dumb-HTTP-cloneable. See git-server.yaml and seed-deploy-repo.sh.

# ── Stage 1: pre-fetch the cluster images into a k3s airgap bundle ────────────
# First boot used to pull the Flux controllers (+ the app's nginx) from the
# network, which made "spinning up sandbox" take ~2.5 min AND required internet.
# We pre-bake those images here with skopeo (daemonless, arch-aware) as
# docker-archive tarballs. The final stage drops them under k3s's airgap images
# dir, so k3s imports them into containerd at startup - first boot becomes fast
# and fully offline. Tags MUST match exactly what `flux install` + the app
# manifest reference, or containerd re-pulls.
FROM debian:bookworm-slim AS imgcache
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends skopeo ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ARG FLUX_SC=ghcr.io/fluxcd/source-controller:v1.3.0
ARG FLUX_KC=ghcr.io/fluxcd/kustomize-controller:v1.3.0
ARG APP_IMG=docker.io/library/nginx:alpine
RUN set -eux \
 && ARCH="$(dpkg --print-architecture)" \
 && mkdir -p /airgap \
 && for ref in "$FLUX_SC" "$FLUX_KC" "$APP_IMG"; do \
        fname="$(printf '%s' "$ref" | tr '/:' '__')"; \
        skopeo copy --retry-times 3 --override-os linux --override-arch "$ARCH" \
            "docker://$ref" "docker-archive:/airgap/${fname}.tar:${ref}"; \
    done

# ── Stage 2: the lab image itself ────────────────────────────────────────────
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# Toolset: identical to k8s-lab plus `git`.
#   bash, coreutils, findutils, grep, sed, gawk → terminal baseline
#   less, vim, nano                             → for editing yaml / kubectl edit
#   man-db, manpages                            → `man kubectl` etc.
#   procps, util-linux, psmisc                  → ps/kill/mount used by k3s
#   tree, jq                                    → handy in dialogue / hints
#   ca-certificates, curl                       → fetching k3s + flux + image pulls
#   git                                         → the player commits + pushes (Ch4)
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
        git \
        apache2 \
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

# Smart-HTTP git server. Flux's source-controller uses go-git, which does NOT
# support the dumb-HTTP protocol - a static file server (nginx) leaves the
# GitRepository stuck with "unable to clone … unexpected EOF". So we serve the
# bare repo over SMART HTTP via apache's CGI + git's `git-http-backend`. apache
# runs as a host process on the node (started by the entrypoint, listening on
# :8080); an in-cluster Service + Endpoints points the cluster at it. Configure
# the debian apache the debian way: enable cgid/alias/env, listen on 8080, and
# drop in our git vhost.
COPY --chown=root:root git-http.conf /etc/apache2/sites-available/git-http.conf
RUN a2enmod cgid alias env authz_core >/dev/null \
 && a2dissite 000-default >/dev/null \
 && sed -i 's/^Listen 80$/Listen 8080/' /etc/apache2/ports.conf \
 && a2ensite git-http >/dev/null

# git-http-backend runs as apache's www-data, but the bare repo is owned by
# `dev` (the player pushes to it). Without this, git aborts every CGI request
# with "detected dubious ownership" → HTTP 500. A system-wide safe.directory
# wildcard is fine for a throwaway lab sandbox.
RUN git config --system --add safe.directory '*'

# Install k3s by direct binary download. The official `get.k3s.io` installer
# fails on this image because its `verify_system()` step *requires* systemd
# (or openrc) on PATH and exits early. The k3s binary itself is fully
# self-contained, so we grab it directly. Pinning the version keeps image
# builds reproducible. (Same approach + version as k8s-lab.)
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

# Airgap bundle: k3s imports every tarball under this dir into containerd at
# startup, so the Flux controllers + the app's nginx are already present and
# first boot never hits the network. (Tarballs produced by the imgcache stage.)
RUN mkdir -p /var/lib/rancher/k3s/agent/images
COPY --from=imgcache /airgap/ /var/lib/rancher/k3s/agent/images/

# Install the Flux CLI by direct binary download. Pinned to a recent Flux 2.x.
# arch-aware just like the k3s block above. The flux2 release ships a tarball
# containing a single `flux` binary.
ARG FLUX_VERSION=2.3.0
RUN set -eux \
 && ARCH="$(dpkg --print-architecture)" \
 && case "$ARCH" in \
      amd64) FLUX_ARCH="amd64" ;; \
      arm64) FLUX_ARCH="arm64" ;; \
      *)     echo "unsupported architecture: $ARCH" >&2; exit 1 ;; \
    esac \
 && curl -fL --retry 3 \
      "https://github.com/fluxcd/flux2/releases/download/v${FLUX_VERSION}/flux_${FLUX_VERSION}_linux_${FLUX_ARCH}.tar.gz" \
      -o /tmp/flux.tar.gz \
 && tar -xzf /tmp/flux.tar.gz -C /usr/local/bin flux \
 && chmod 0755 /usr/local/bin/flux \
 && rm -f /tmp/flux.tar.gz \
 && flux --version

# Create the player. uid 1000 matches typical macOS host uid mapping.
RUN useradd --create-home --shell /bin/bash --uid 1000 dev

# Marker directory + dev's kube + manifests + working dir. Single RUN so the
# chown applies to everything in one layer.
RUN mkdir -p /tmp/.cosmos /home/dev/.kube /home/dev/manifests /home/dev/work \
 && chown -R dev:dev /tmp/.cosmos /home/dev \
 && chmod 0755 /tmp/.cosmos

# Drop the friendly bash setup.
COPY --chown=dev:dev bashrc       /home/dev/.bashrc
COPY --chown=dev:dev bash_profile /home/dev/.bash_profile

# The in-cluster git-server manifest, applied by the entrypoint after the node
# is Ready. Lives under /opt/cosmos so it's clearly an image asset, not player
# scratch space.
COPY --chown=root:root git-server.yaml /opt/cosmos/git-server.yaml

# Seed the bare deploy repo at /srv/repos/cosmos-deploy.git. We COPY the seed
# script and RUN it at build time so the repo (and its post-update hook) is
# baked into the image. git's commit step needs an author identity, so the
# script sets a throwaway one locally.
RUN mkdir -p /srv/repos
COPY --chown=root:root seed-deploy-repo.sh /usr/local/bin/seed-deploy-repo.sh
RUN chmod 0755 /usr/local/bin/seed-deploy-repo.sh \
 && /usr/local/bin/seed-deploy-repo.sh \
 && chown -R dev:dev /srv/repos \
 && chmod -R a+rX /srv/repos
# Why chown to dev? The player pushes to this bare repo AS dev (their working
# clone's origin is the local /srv/repos path), and each mission's setup.sh
# resets the repo's `main` to a known baseline - both need dev to own it. The
# `a+rX` keeps it world-readable so the in-cluster nginx git-server pod can
# serve it over dumb-HTTP to Flux's source-controller.

# Entrypoint - starts k3s, waits for the API, installs the git-server + Flux,
# then sleeps forever so the orchestrator can `docker exec` into it.
COPY --chown=root:root flux-entrypoint.sh /usr/local/bin/flux-entrypoint.sh
RUN chmod 0755 /usr/local/bin/flux-entrypoint.sh

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
# create veth pairs, etc. Player shells are explicitly attached as `dev` by the
# orchestrator via `docker exec -u dev`.

ENTRYPOINT ["/usr/local/bin/flux-entrypoint.sh"]
