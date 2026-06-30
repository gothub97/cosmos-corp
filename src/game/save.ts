// Save state - thin wrapper around the IPC `save_progress` / `load_progress`
// commands.
//
// The on-disk format is owned by Stream A (Rust). This module's job is to
// keep migrations at the schema boundary so the rest of the app only ever
// sees the latest shape (`SaveState`).
//
// Schema history:
//   v1 → original shape (currentMission, completedMissions, hintsByObjective).
//   v2 → adds `taughtCommands: string[]` for the lesson-card dedupe system.
//   v3 → adds `coursesRead: ChapterId[]` for the "course already read" tracking.
//   v4 → adds `profile` (firstName/lastName/role/employeeId/onboardedAt) for the
//        first-launch onboarding.

import { invoke } from "@tauri-apps/api/core";
import type {
  SaveState,
  MissionKey,
  ChapterId,
  PlayerProfile,
} from "../ipc/contract";

/** The schema version the app currently writes. Bump when the shape changes. */
export const CURRENT_SAVE_VERSION = 4 as const;

const CHAPTER_ID_RE = /^ch0[1-4]$/;

/** A blank, un-onboarded profile. Empty `firstName` means "not onboarded yet". */
function emptyProfile(): PlayerProfile {
  return { firstName: "", lastName: "", role: "", employeeId: "", onboardedAt: "" };
}

/** A blank save - what we hand back on first run. */
export function emptySave(): SaveState {
  return {
    version: CURRENT_SAVE_VERSION,
    currentMission: null,
    completedMissions: [],
    hintsByObjective: {},
    taughtCommands: [],
    coursesRead: [],
    profile: emptyProfile(),
    lastPlayedAt: new Date().toISOString(),
  };
}

/**
 * Run migrations on a loaded save so the rest of the app only handles the
 * current `SaveState` shape. Returns a freshly-versioned object - never mutates
 * the input.
 *
 * The strategy is *defensive normalization* rather than per-version branches:
 * we read every field with a runtime type-check and fall back to the v2 default
 * if it's missing or malformed. That way:
 *
 *   - v1 → v2: `taughtCommands` is missing → defaults to `[]`. (No other v1
 *     fields changed shape, so the rest passes through unchanged.)
 *   - v2 → v3: `coursesRead` is missing → defaults to `[]`.
 *   - v3 → v4: `profile` is missing → defaults to a blank, un-onboarded profile.
 *   - corrupted / partial saves: each missing field gets a sensible default
 *     instead of throwing.
 *   - hand-edited saves with extra junk: silently dropped.
 *
 * Add a new branch here when you bump CURRENT_SAVE_VERSION beyond 4.
 */
export function migrate(raw: unknown): SaveState {
  // First-run / corrupted file - start fresh.
  if (raw == null || typeof raw !== "object") return emptySave();

  const r = raw as Partial<SaveState> & { version?: number };
  const version = typeof r.version === "number" ? r.version : 0;

  let migrated: SaveState = {
    version: CURRENT_SAVE_VERSION,
    currentMission: typeof r.currentMission === "string" ? r.currentMission : null,
    completedMissions: Array.isArray(r.completedMissions)
      ? r.completedMissions.filter((m): m is MissionKey => typeof m === "string")
      : [],
    hintsByObjective:
      r.hintsByObjective && typeof r.hintsByObjective === "object"
        ? sanitizeHints(r.hintsByObjective)
        : {},
    // v1 → v2 migration: field absent from v1 saves, default to empty array.
    taughtCommands: Array.isArray(r.taughtCommands)
      ? r.taughtCommands.filter((c): c is string => typeof c === "string" && c.length > 0)
      : [],
    // v2 → v3 migration: field absent from v1/v2 saves, default to empty array.
    coursesRead: Array.isArray(r.coursesRead)
      ? r.coursesRead.filter(
          (c): c is ChapterId => typeof c === "string" && CHAPTER_ID_RE.test(c),
        )
      : [],
    // v3 → v4 migration: field absent from v1/v2/v3 saves, default to a blank
    // (un-onboarded) profile. Each field is read defensively.
    profile: sanitizeProfile(r.profile),
    lastPlayedAt:
      typeof r.lastPlayedAt === "string" ? r.lastPlayedAt : new Date().toISOString(),
  };

  if (version > CURRENT_SAVE_VERSION) {
    // A newer-format save than this build understands - keep the user's
    // progress as best we can but reset the version stamp to ours.
    migrated = { ...migrated, version: CURRENT_SAVE_VERSION };
  }

  return migrated;
}

function sanitizeProfile(input: unknown): PlayerProfile {
  const base = emptyProfile();
  if (input == null || typeof input !== "object") return base;
  const p = input as Partial<Record<keyof PlayerProfile, unknown>>;
  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  return {
    firstName: str(p.firstName),
    lastName: str(p.lastName),
    role: str(p.role),
    employeeId: str(p.employeeId),
    onboardedAt: str(p.onboardedAt),
  };
}

function sanitizeHints(input: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      out[k] = Math.floor(v);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC bridge
// ─────────────────────────────────────────────────────────────────────────────

/** Load save state from disk, applying migrations. Returns a blank save on first run. */
export async function loadProgress(): Promise<SaveState> {
  const raw = await invoke<SaveState | null>("load_progress");
  if (!raw) return emptySave();
  return migrate(raw);
}

/** Persist save state to disk. Stamps `lastPlayedAt` to "now" so the user sees fresh timestamps. */
export async function saveProgress(state: SaveState): Promise<void> {
  const stamped: SaveState = {
    ...state,
    version: CURRENT_SAVE_VERSION,
    lastPlayedAt: new Date().toISOString(),
  };
  await invoke<void>("save_progress", { state: stamped });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers used by the engine + UI
// ─────────────────────────────────────────────────────────────────────────────

export function markMissionComplete(state: SaveState, key: MissionKey): SaveState {
  if (state.completedMissions.includes(key)) return state;
  return {
    ...state,
    completedMissions: [...state.completedMissions, key],
  };
}

export function setCurrentMission(state: SaveState, key: MissionKey | null): SaveState {
  if (state.currentMission === key) return state;
  return { ...state, currentMission: key };
}

export function bumpHint(state: SaveState, objectiveId: string): SaveState {
  const next = (state.hintsByObjective[objectiveId] ?? 0) + 1;
  return {
    ...state,
    hintsByObjective: { ...state.hintsByObjective, [objectiveId]: next },
  };
}

/**
 * Add a command to the taughtCommands list if not already present. Used after
 * the player dismisses a Lesson card so future objectives keyed off the same
 * command skip the card.
 */
export function addTaughtCommand(state: SaveState, command: string): SaveState {
  if (state.taughtCommands.includes(command)) return state;
  return {
    ...state,
    taughtCommands: [...state.taughtCommands, command],
  };
}
