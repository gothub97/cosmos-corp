// IPC contract between the React frontend and the Rust backend.
// This file is the single source of truth — Stream A (Rust) and Stream B (React)
// must keep their implementations in sync with these types.
//
// Conventions:
//   - Command names use snake_case to match Rust naming.
//   - Event channel names use a "domain:event" pattern.
//   - All payloads are plain JSON-serializable shapes.

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export type ChapterId = "ch01" | "ch02" | "ch03" | "ch04";

export interface MissionId {
  chapter: ChapterId;
  /** Mission slug, e.g. "m01-first-steps". */
  slug: string;
}

/** Stable string form: "ch01.m01-first-steps". */
export type MissionKey = string;

export interface Objective {
  id: string;
  label: string;
  /** True once the validator has confirmed completion. */
  completed: boolean;
  /** Number of hints already revealed (0 = none). */
  hintsRevealed: number;
}

export interface MissionState {
  key: MissionKey;
  title: string;
  containerImage: string;
  objectives: Objective[];
  /** Markdown rendered into the dialogue box before the terminal opens. */
  introDialogue: string;
  /** Markdown rendered after all objectives complete. */
  outroDialogue: string;
}

export interface SaveState {
  /** Schema version for migrations. */
  version: 1;
  currentMission: MissionKey | null;
  completedMissions: MissionKey[];
  /** Per-mission, the number of hints the player has revealed. */
  hintsByObjective: Record<string, number>;
  lastPlayedAt: string;
}

export type DockerStatus =
  | { state: "starting"; message?: string }
  | { state: "ready"; message?: string }
  | { state: "error"; message: string };

// ─────────────────────────────────────────────────────────────────────────────
// Commands  (frontend  →  Rust)
// ─────────────────────────────────────────────────────────────────────────────

export interface IpcCommands {
  /** Health-check Docker. Called on app start and from the first-run wizard. */
  docker_health: () => Promise<{ ok: boolean; reason?: string }>;

  /** List discovered chapters + missions from the bundled content/ folder. */
  list_content: () => Promise<{
    chapters: Array<{ id: ChapterId; title: string; missions: MissionKey[] }>;
  }>;

  /** Start (or resume) a mission. Spawns the chapter container if needed,
   *  runs setup.sh, attaches a PTY, begins the validator polling loop. */
  start_mission: (args: { key: MissionKey }) => Promise<MissionState>;

  /** Forward keyboard bytes from xterm.js to the PTY. */
  write_pty: (args: { bytes: number[] }) => Promise<void>;

  /** Notify Rust of an xterm.js resize so the PTY's rows/cols match. */
  resize_pty: (args: { cols: number; rows: number }) => Promise<void>;

  /** Reveal the next hint for an objective. Returns the hint text. */
  reveal_hint: (args: { objectiveId: string }) => Promise<{ text: string }>;

  /** Tear down the chapter container and recreate it fresh. */
  reset_chapter: (args: { chapter: ChapterId }) => Promise<void>;

  /** Persist save state to ~/Library/Application Support/cosmos-corp/save.json. */
  save_progress: (args: { state: SaveState }) => Promise<void>;

  /** Load save state. Returns null on first run. */
  load_progress: () => Promise<SaveState | null>;
}

export type CommandName = keyof IpcCommands;

// ─────────────────────────────────────────────────────────────────────────────
// Events  (Rust  →  frontend)
// ─────────────────────────────────────────────────────────────────────────────

export type IpcEvent =
  | { channel: "pty:data"; payload: { bytes: number[] } }
  | { channel: "objective:completed"; payload: { objectiveId: string } }
  | { channel: "mission:completed"; payload: { key: MissionKey } }
  | { channel: "docker:status"; payload: DockerStatus }
  | { channel: "validator:error"; payload: { message: string } };

export type EventChannel = IpcEvent["channel"];

export type EventPayload<C extends EventChannel> = Extract<
  IpcEvent,
  { channel: C }
>["payload"];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function missionKey(id: MissionId): MissionKey {
  return `${id.chapter}.${id.slug}`;
}

export function parseMissionKey(key: MissionKey): MissionId {
  const [chapter, ...rest] = key.split(".");
  return { chapter: chapter as ChapterId, slug: rest.join(".") };
}
