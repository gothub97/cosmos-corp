/**
 * Zustand store - the single source of UI truth for Cosmos Corp.
 *
 * Responsibilities:
 *   - Track which scene is currently rendered (title / chapter map / mission /
 *     chapter complete / dev terminal).
 *   - Mirror engine state (`MissionState | null`, docker status) so React
 *     components can subscribe to slices.
 *   - Hold UI-only state the engine doesn't track: revealed hint texts per
 *     objective, last error toast, save state cache.
 *   - Expose action methods that delegate IPC to `engine`.
 *
 * All IPC funnels through `engine.*` - the store does not call `invoke()`
 * directly. That keeps a single seam for future instrumentation (logging,
 * mock engines for tests).
 */

import { create } from "zustand";
import type {
  ChapterId,
  DockerStatus,
  MissionKey,
  MissionState,
  PlayerProfile,
  SaveState,
} from "../ipc/contract";
import { engine, type EngineState } from "./engine";
import { listChapters } from "./content-loader";

// ─── Scene routing ───────────────────────────────────────────────────────────

export type Scene =
  | { kind: "title" }
  | { kind: "onboarding" }
  | { kind: "chapter-select" }
  | { kind: "chapter-intro"; chapter: ChapterId }
  | { kind: "course"; chapter: ChapterId }
  | { kind: "chapter-map"; chapter: ChapterId }
  | { kind: "mission"; key: MissionKey }
  | { kind: "chapter-complete"; chapter: ChapterId }
  | { kind: "dev-terminal" } // M0 walking-skeleton entry point
  | { kind: "boot-error"; message: string };

export interface ChapterSummary {
  id: ChapterId;
  title: string;
  missions: MissionKey[];
}

// ─── Store shape ─────────────────────────────────────────────────────────────

export interface GameStore {
  // ── boot / engine mirror ────────────────────────────────────────────────
  ready: boolean;
  scene: Scene;
  engineState: EngineState;
  dockerStatus: DockerStatus | null;

  // ── content ────────────────────────────────────────────────────────────
  chapters: ChapterSummary[];

  // ── persistence ────────────────────────────────────────────────────────
  save: SaveState | null;

  // ── per-mission UI state ───────────────────────────────────────────────
  /** Hint texts already revealed, keyed by objectiveId. */
  hintsByObjective: Record<string, string[]>;
  /**
   * Index of the current (first incomplete) objective in `mission.objectives`,
   * or `-1` when no mission is loaded / all objectives complete. Kept in sync
   * with `engineState` via the `state-changed` listener.
   */
  currentObjectiveIndex: number;
  /**
   * Objective IDs whose lesson card has been acknowledged in *this* session.
   * Cleared when a new mission starts. Cross-mission "already taught" suppression
   * lives in `mission.taughtCommands` - this is just per-objective bookkeeping
   * so dismissing the card removes the overlay without waiting for the engine
   * round-trip.
   */
  lessonShownFor: Set<string>;
  /** Last validator/IPC error to surface as a toast. */
  lastError: string | null;

  // ── actions ────────────────────────────────────────────────────────────
  /** Wire engine events to store, hydrate save state, list content. Idempotent. */
  init: () => Promise<void>;
  goTo: (scene: Scene) => void;
  /** Re-run the Docker health probe and update `dockerStatus`. Used by the
   *  onboarding system-check step. Never throws. */
  probeDocker: () => Promise<void>;
  startMission: (key: MissionKey) => Promise<void>;
  revealHint: (objectiveId: string) => Promise<void>;
  resetChapter: (chapter: ChapterId) => Promise<void>;
  saveProgress: () => Promise<void>;
  /** Mark a chapter's theoretical course as read (idempotent) and persist.
   *  Drives the "auto-open the course the first time" behaviour. */
  markCourseRead: (chapter: ChapterId) => Promise<void>;
  newGame: () => Promise<void>;
  continueGame: () => Promise<void>;
  /** Persist the onboarding profile onto the save and return to the (now
   *  personalized) title. Called when the wizard's final step is confirmed. */
  completeOnboarding: (profile: PlayerProfile) => Promise<void>;
  /**
   * Acknowledge a lesson card. Persists via `engine.markCommandTaught` and
   * marks the objective's lesson as shown for this session so the overlay
   * disappears without waiting for the engine round-trip.
   */
  acknowledgeLesson: (objectiveId: string, command: string) => Promise<void>;
  clearError: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptySave(): SaveState {
  return {
    version: 4,
    currentMission: null,
    completedMissions: [],
    hintsByObjective: {},
    taughtCommands: [],
    coursesRead: [],
    profile: { firstName: "", lastName: "", role: "", employeeId: "", onboardedAt: "" },
    lastPlayedAt: new Date().toISOString(),
  };
}

function mergeMission(state: EngineState): MissionState | null {
  if (state.kind === "playing" || state.kind === "completing") return state.mission;
  return null;
}

/** Index of the first incomplete objective in a mission, or -1. */
function firstIncompleteIndex(mission: MissionState | null): number {
  if (!mission) return -1;
  return mission.objectives.findIndex((o) => !o.completed);
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useGameStore = create<GameStore>((set, get) => ({
  ready: false,
  scene: { kind: "title" },
  engineState: engine.getState(),
  dockerStatus: null,
  chapters: [],
  save: null,
  hintsByObjective: {},
  currentObjectiveIndex: firstIncompleteIndex(mergeMission(engine.getState())),
  lessonShownFor: new Set<string>(),
  lastError: null,

  async init() {
    if (get().ready) return;
    // Wire engine events first so we don't miss anything emitted during boot.
    await engine.init();

    engine.on("state-changed", ({ state }) => {
      const mission = mergeMission(state);
      const idx = firstIncompleteIndex(mission);
      set({ engineState: state, currentObjectiveIndex: idx });
    });
    engine.on("objective-completed", () => {
      // Engine already updated MissionState; the state-changed handler will
      // publish the new mission. Trigger an autosave alongside.
      void get().saveProgress();
    });
    engine.on("mission-completed", ({ missionKey }) => {
      const save = get().save ?? emptySave();
      if (!save.completedMissions.includes(missionKey)) {
        const nextSave: SaveState = {
          ...save,
          completedMissions: [...save.completedMissions, missionKey],
          lastPlayedAt: new Date().toISOString(),
        };
        set({ save: nextSave });
      }
      void get().saveProgress();
    });
    engine.on("docker-status", ({ status }) => {
      set({ dockerStatus: status });
    });
    engine.on("validator-error", ({ message }) => {
      set({ lastError: message });
    });

    // Probe Docker once on boot so the title / onboarding scene can warn early.
    await get().probeDocker();

    // Pull bundled chapter list. Tolerant of failure - keeps app usable for M0.
    try {
      const { chapters } = await engine.listContent();
      set({ chapters });
    } catch (err) {
      console.warn("[store] list_content failed:", err);
    }

    // Hydrate save. engine.loadProgress() always returns a SaveState - the
    // engine substitutes a blank one on first run, so callers don't null-check.
    // SaveState carries per-objective hint *counts*, not texts; the actual
    // hint strings are re-fetched on demand via revealHint().
    try {
      const save = await engine.loadProgress();
      set({ save, hintsByObjective: {} });
      // First-launch gate: a player who hasn't onboarded yet (blank profile,
      // covers null/fresh saves) lands in the onboarding wizard instead of the
      // title. Returning players keep the default `title` scene.
      if (!save.profile.firstName.trim()) {
        set({ scene: { kind: "onboarding" } });
      }
    } catch (err) {
      console.warn("[store] load_progress failed:", err);
    }

    set({ ready: true });
  },

  goTo(scene) {
    set({ scene });
  },

  async probeDocker() {
    try {
      const health = await engine.dockerHealth();
      set({
        dockerStatus: health.ok
          ? { state: "ready" }
          : { state: "error", message: health.reason ?? "Docker is not available." },
      });
    } catch (err) {
      // Docker probe failure is non-fatal - the scene still renders.
      const message = err instanceof Error ? err.message : String(err);
      set({ dockerStatus: { state: "error", message } });
    }
  },

  async startMission(key) {
    // Fresh mission → reset the per-session lesson bookkeeping. Cross-mission
    // suppression still works because `mission.taughtCommands` is rehydrated
    // from the engine cache on every `start_mission`.
    set({
      lastError: null,
      hintsByObjective: {},
      lessonShownFor: new Set<string>(),
    });
    try {
      await engine.start(key);
      set({ scene: { kind: "mission", key } });
      // Persist current pointer so a relaunch resumes here.
      const save = get().save ?? emptySave();
      const nextSave: SaveState = {
        ...save,
        currentMission: key,
        lastPlayedAt: new Date().toISOString(),
      };
      set({ save: nextSave });
      void get().saveProgress();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ lastError: `Could not start mission: ${message}` });
    }
  },

  async revealHint(objectiveId) {
    try {
      const { text } = await engine.revealHint(objectiveId);
      const map = { ...get().hintsByObjective };
      const list = map[objectiveId] ?? [];
      map[objectiveId] = [...list, text];
      set({ hintsByObjective: map });

      // Keep the SaveState's per-objective count in sync (texts aren't
      // serialized - those come back from the engine when re-revealed).
      const save = get().save ?? emptySave();
      const counts = { ...save.hintsByObjective };
      counts[objectiveId] = (counts[objectiveId] ?? 0) + 1;
      const nextSave: SaveState = {
        ...save,
        hintsByObjective: counts,
        lastPlayedAt: new Date().toISOString(),
      };
      set({ save: nextSave });
      void get().saveProgress();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ lastError: `Could not reveal hint: ${message}` });
    }
  },

  async resetChapter(chapter) {
    // Tear down the sandbox container (Rust side) AND wipe this chapter's
    // mission progress, so the chapter genuinely starts over and the map
    // visibly resets. Course-read state is intentionally kept (so re-entering
    // doesn't bounce back into the course).
    await engine.resetChapter(chapter);
    const save = get().save;
    if (save) {
      const keys = new Set(
        listChapters().find((c) => c.id === chapter)?.missions.map((m) => m.key) ??
          [],
      );
      const nextSave: SaveState = {
        ...save,
        completedMissions: save.completedMissions.filter((k) => !keys.has(k)),
        currentMission:
          save.currentMission && keys.has(save.currentMission)
            ? null
            : save.currentMission,
        lastPlayedAt: new Date().toISOString(),
      };
      set({ save: nextSave });
      void get().saveProgress();
    }
    set({ scene: { kind: "chapter-map", chapter }, hintsByObjective: {}, lastError: null });
  },

  async acknowledgeLesson(objectiveId, command) {
    // 1. Mark in-session so the overlay clears immediately even if the engine
    //    persistence is slow.
    set((s) => {
      const next = new Set(s.lessonShownFor);
      next.add(objectiveId);
      return { lessonShownFor: next };
    });
    // 2. Persist via the engine. It mutates mission.taughtCommands, fires
    //    "command-taught" + "state-changed", and writes through to disk -
    //    so future missions whose lesson has the same `command` will skip
    //    the card. Idempotent on duplicate commands.
    try {
      await engine.markCommandTaught(command);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Non-fatal: the card is already cleared in-session. Log + surface.
      console.warn("[store] markCommandTaught failed:", err);
      set({ lastError: `Could not record lesson: ${message}` });
    }
  },

  async saveProgress() {
    const save = get().save;
    if (!save) return;
    try {
      // engine.saveProgress() stamps lastPlayedAt internally - we don't need to.
      await engine.saveProgress(save);
    } catch (err) {
      console.warn("[store] save_progress failed:", err);
    }
  },

  async markCourseRead(chapter) {
    const save = get().save ?? emptySave();
    if (save.coursesRead.includes(chapter)) return;
    const nextSave: SaveState = {
      ...save,
      coursesRead: [...save.coursesRead, chapter],
      lastPlayedAt: new Date().toISOString(),
    };
    set({ save: nextSave });
    await get().saveProgress();
  },

  async newGame() {
    // Wipe progress but keep the player's identity - onboarding is a one-time
    // thing, "New game" just restarts the journey for the same person.
    const profile = get().save?.profile ?? emptySave().profile;
    const save: SaveState = { ...emptySave(), profile };
    set({ save, hintsByObjective: {} });
    void get().saveProgress();
    // Default first chapter; if content list is empty, fall back to ch01.
    const firstChapter = get().chapters[0]?.id ?? ("ch01" as ChapterId);
    set({ scene: { kind: "chapter-intro", chapter: firstChapter } });
  },

  async continueGame() {
    const save = get().save;
    if (save?.currentMission) {
      await get().startMission(save.currentMission);
    } else {
      // No save yet - start fresh.
      await get().newGame();
    }
  },

  async completeOnboarding(profile) {
    const save = get().save ?? emptySave();
    const nextSave: SaveState = {
      ...save,
      profile,
      lastPlayedAt: new Date().toISOString(),
    };
    set({ save: nextSave });
    await get().saveProgress();
    set({ scene: { kind: "title" } });
  },

  clearError() {
    set({ lastError: null });
  },
}));

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectMission = (s: GameStore): MissionState | null =>
  mergeMission(s.engineState);

export const selectIsLoading = (s: GameStore): boolean =>
  s.engineState.kind === "loading";

export const selectIsCompleting = (s: GameStore): boolean =>
  s.engineState.kind === "completing";

export const selectChapter =
  (id: ChapterId) =>
  (s: GameStore): ChapterSummary | undefined =>
    s.chapters.find((c) => c.id === id);
