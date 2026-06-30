# cosmos/terminal-base:latest
# Sandbox image for Chapter 1 (the terminal). Beginner-friendly: bash + GNU coreutils
# plus the file-poking tools missions 01–07 need. Built on debian:bookworm-slim because
# alpine's BusyBox versions of `find`, `ps`, `ls`, etc. behave differently from what
# Daymari will see on a real Linux box.

FROM debian:bookworm-slim

# Avoid interactive prompts during apt-get.
ENV DEBIAN_FRONTEND=noninteractive

# Core toolset for chapter 1. Grouped by mission so it's clear what each one is for.
#   bash, coreutils       → mission 01–07 baseline
#   findutils, grep       → mission 05 (search)
#   less, vim, nano       → mission 02 (reading) + general editing
#   man-db, manpages      → so `man <cmd>` works
#   procps, util-linux    → mission 06 (ps, kill, mount, …)
#   jq, tree              → bonus tools used in dialogue / hints
#   ca-certificates       → so apt + curl don't choke later
#   curl                  → handy for follow-up missions, small footprint
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
        jq \
        tree \
        ca-certificates \
        curl \
 && rm -rf /var/lib/apt/lists/*

# Re-enable man pages - debian-slim disables them by default via dpkg config.
RUN sed -i '/path-exclude=\/usr\/share\/man/d' /etc/dpkg/dpkg.cfg.d/docker || true \
 && sed -i '/path-exclude=\/usr\/share\/doc/d' /etc/dpkg/dpkg.cfg.d/docker || true

# Create the player. uid 1000 matches typical macOS host uid mapping.
RUN useradd --create-home --shell /bin/bash --uid 1000 dev

# Marker directory for the mission validator. The validator (Rust side) polls
# `test -f /tmp/.cosmos/<objective_id>` against this path; check.sh writes the markers.
RUN mkdir -p /tmp/.cosmos && chown dev:dev /tmp/.cosmos && chmod 0755 /tmp/.cosmos

# Seed the welcome workspace used by missions 01 & 02. Missions copy/regenerate
# this via setup.sh, but we ship a default so the very first mission always has
# something to look at even before setup.sh runs.
COPY --chown=dev:dev welcome/ /home/dev/welcome/

# Drop a tiny .bashrc so prompts feel friendly and bash records history (needed by
# some check.sh scripts that grep ~/.bash_history).
COPY --chown=dev:dev bashrc /home/dev/.bashrc
COPY --chown=dev:dev bash_profile /home/dev/.bash_profile

USER dev
WORKDIR /home/dev
ENV HOME=/home/dev \
    SHELL=/bin/bash \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    TERM=xterm-256color \
    HISTFILE=/home/dev/.bash_history \
    HISTSIZE=2000 \
    HISTFILESIZE=5000 \
    PROMPT_COMMAND="history -a"

# The container is kept alive by the Rust side (`docker exec` for each PTY).
# A long-lived sleep avoids needing --rm gymnastics if the entrypoint exits.
CMD ["bash"]
