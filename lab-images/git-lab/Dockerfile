# cosmos/git-lab:latest
# Sandbox image for Chapter 2 (git). Inherits the Chapter-1 baseline of bash +
# coreutils + man pages, then layers `git` on top and pre-seeds two bare
# repositories under /srv/repos/ that the missions clone from.
#
# Same conventions as terminal-base:
#   - debian:bookworm-slim base
#   - dev user, uid 1000
#   - /tmp/.cosmos/ marker dir, owned by dev
#   - PROMPT_COMMAND="history -a" so check.sh can grep ~/.bash_history if needed
#     (most chapter-2 validators use git state instead, but we keep parity)

FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# Toolset:
#   bash, coreutils, findutils, grep, sed, gawk  → terminal-base baseline
#   less, vim, nano                              → editing during conflicts/rebase
#   man-db, manpages                             → `man git-…` works
#   procps, util-linux, psmisc                   → kept for parity with terminal-base
#   jq, tree                                     → handy in dialogue / hints
#   ca-certificates, curl                        → in case a mission ever talks to a URL
#   git                                          → the headline act
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
        git \
 && rm -rf /var/lib/apt/lists/*

# Re-enable man pages - debian-slim disables them by default via dpkg config.
RUN sed -i '/path-exclude=\/usr\/share\/man/d' /etc/dpkg/dpkg.cfg.d/docker || true \
 && sed -i '/path-exclude=\/usr\/share\/doc/d' /etc/dpkg/dpkg.cfg.d/docker || true

# Create the player.
RUN useradd --create-home --shell /bin/bash --uid 1000 dev

# Marker directory for the validator. Same convention as terminal-base.
RUN mkdir -p /tmp/.cosmos && chown dev:dev /tmp/.cosmos && chmod 0755 /tmp/.cosmos

# Repo storage. Owned by dev so the bootstrapper script (and player pushes
# against the bare repos) can write without sudo.
RUN mkdir -p /srv/repos && chown dev:dev /srv/repos

# Drop the friendly bash setup + the pre-seeded git globals.
COPY --chown=dev:dev bashrc       /home/dev/.bashrc
COPY --chown=dev:dev bash_profile /home/dev/.bash_profile
COPY --chown=dev:dev gitconfig    /home/dev/.gitconfig

# Seed scripts get copied into a known location and executed as `dev`. Keeping
# the script in /usr/local/bin makes it easy to re-run for debugging from
# inside a running container.
COPY --chown=root:root seed-repos.sh /usr/local/bin/seed-repos.sh
RUN chmod 0755 /usr/local/bin/seed-repos.sh

USER dev
WORKDIR /home/dev

# Run the seed *as dev* so all repo objects end up owned by uid 1000. If we
# ran it as root the player would hit "dubious ownership" errors when running
# `git -C /srv/repos/...` later.
RUN /usr/local/bin/seed-repos.sh

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
    GIT_EDITOR=nano

# The container is kept alive by the Rust side - `docker exec` opens fresh PTYs
# for each mission. CMD is just the friendly fallback if someone runs it
# manually.
CMD ["bash"]
