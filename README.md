# Cosmos Corp: Day One

A macOS desktop game that teaches the terminal, git, Kubernetes, and FluxCD through a story-driven RPG. Built with Tauri 2 + React + TypeScript. Real bash, real `git`, real `kubectl`, real `flux` — all running in per-chapter Docker sandboxes.

> Built for Daymari to onboard onto her DevOps stack the fun way.

## Status

Early development. See [`/Users/g.hubert/.claude/plans/i-work-with-daymari-buzzing-teapot.md`](../../.claude/plans/i-work-with-daymari-buzzing-teapot.md) for the architecture and roadmap.

## Prerequisites

- macOS 13+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or [Colima](https://github.com/abiosoft/colima)
- Node 20+ (developed on 25)
- pnpm 10+
- Rust stable (`curl https://sh.rustup.rs -sSf | sh`)
- Xcode Command Line Tools (`xcode-select --install`)

## Develop

```bash
pnpm install
pnpm tauri dev
```

## Build

```bash
pnpm tauri build
# → src-tauri/target/release/bundle/dmg/Cosmos Corp_<version>_aarch64.dmg
```

## Repo layout

| Path | Purpose |
|---|---|
| `src-tauri/` | Rust backend — PTY bridge, Docker lifecycle, validator, save store |
| `src/` | React frontend — terminal, scenes, dialogue, objectives |
| `src/ipc/` | Shared IPC contract types (frontend ↔ Rust) |
| `content/` | Mission YAML + dialogue Markdown — no rebuild needed to author |
| `lab-images/` | Dockerfiles for per-chapter sandboxes |

## Chapter map

1. **Terminal** — bash navigation, files, pipes, search, processes, env
2. **Git** — commit / branch / merge / rebase / conflicts / remotes
3. **Kubernetes** — pods / deployments / services / debugging on k3d
4. **FluxCD** — GitOps, reconciliation, drift detection
