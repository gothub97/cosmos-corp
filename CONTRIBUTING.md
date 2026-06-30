# Contributing to Cosmos Corp

Thanks for wanting to help. This is a learning game, so clarity and good habits
matter as much as correctness. This guide covers how to get set up, how we work,
and how releases happen.

## Getting set up

```bash
pnpm install
pnpm tauri dev
```

You will need the prerequisites listed in the [README](README.md#prerequisites):
macOS, Docker, Node 20+, pnpm 10+, Rust stable, and the Xcode CLI tools.

## Project shape

- **`src/ipc/contract.ts` is the single source of truth** for the boundary between
  the React frontend and the Rust backend. Change it first, then update both sides
  to match.
- **Frontend** lives in `src/` (scenes, components, the Zustand store in
  `src/game/store.ts`).
- **Backend** lives in `src-tauri/src/` (PTY bridge, Docker + cluster lifecycle, the
  validator, and the save store under `src-tauri/src/commands/`).
- **Content** lives in `content/` as mission YAML, dialogue, and per-chapter courses.
  You can author content without recompiling.

### The save store

Save state is versioned. When you add a field, bump the version in all three places
and follow the existing defensive-migration pattern:

- `src/ipc/contract.ts` (the `SaveState` type + a legacy interface),
- `src/game/save.ts` (`CURRENT_SAVE_VERSION`, `emptySave`, `migrate`),
- `src-tauri/src/commands/save.rs` (`CURRENT_VERSION`, `#[serde(default)]`, a test).

Older saves must always load cleanly. There are migration tests in `save.rs` - add one.

## Code style

- **No em dashes.** Use a spaced hyphen ( - ) or a comma. This applies to code,
  comments, UI copy, and content. It is enforced in review.
- Match the surrounding code: same naming, same comment density, same idioms.
- Sage's voice has rules. Before writing any dialogue or course copy, read
  [`docs/characters/sage.md`](docs/characters/sage.md).
- Player-facing copy can use `{firstName}`, `{lastName}`, and `{role}` tokens; they
  are substituted at render time (see `src/game/personalize.ts`).

## Before you open a PR

Run the same checks CI runs:

```bash
pnpm typecheck                              # TypeScript
pnpm build                                  # frontend builds
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests
pnpm tauri build --debug                    # the bundle still packages
```

## Branches and commits

- Branch off `main` with a short descriptive name, e.g. `feat/onboarding-badge` or
  `fix/save-migration`.
- Write clear commit messages in the imperative mood ("Add ...", "Fix ...").
- Open a PR against `main`. CI must be green.

## Adding a changeset (required for user-facing changes)

We use [Changesets](https://github.com/changesets/changesets) to manage versions and
the changelog. If your change is visible to players or changes behavior, add a
changeset in the same PR:

```bash
pnpm changeset
```

Pick a bump type and write a one-line summary:

- **patch** - bug fixes and small tweaks
- **minor** - new features
- **major** - breaking changes

This writes a small markdown file under `.changeset/`. Commit it with your change.
Internal-only refactors with no player-visible effect do not need one.

## How a release happens

You do not tag releases by hand. The flow is automated:

1. Your PR (with its changeset) merges into `main`.
2. The **Changesets** workflow opens or updates a "Version Packages" PR that bumps the
   version and updates `CHANGELOG.md`.
3. Merging that PR pushes a `v<version>` tag.
4. The **Release** workflow builds the macOS bundle and publishes it to a
   [GitHub Release](https://github.com/gothub97/cosmos-corp/releases).

That is it. Thanks for contributing.
