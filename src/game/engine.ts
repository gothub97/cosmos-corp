// Mission engine - the state machine that drives a single play session.
//
// Responsibilities:
//   1. Translate UI intents (start mission, reveal hint, send keystrokes) into
//      the IPC commands defined in `src/ipc/contract.ts`.
//   2. Subscribe to the Rust → frontend events and re-emit them on a typed
//      EventEmitter the React layer can listen to.
//   3. Track which mission is active and which objectives have completed.
//
// This module deliberately does NOT own the Zustand store - that's `react-ui`'s
// territory. The store will subscribe to engine events and reflect them.
//
// State machine:
//
//   idle ──start()──▶ loading ──mission ready──▶ playing ──all objectives──▶ completing
//                                  ▲                                              │
//                                  └──────── start(next) ◀──────────────────────┘
//
//   resetChapter() / start() called at any time → loading.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ChapterId,
  ClusterSnapshot,
  ClusterViewSpec,
  EventChannel,
  EventPayload,
  MissionState,
  Objective,
  MissionKey,
  DockerStatus,
  SaveState,
} from "../ipc/contract";
import { addTaughtCommand, loadProgress, saveProgress } from "./save";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type EngineState =
  | { kind: "idle" }
  | { kind: "loading"; key: MissionKey }
  | { kind: "playing"; mission: MissionState }
  | { kind: "completing"; mission: MissionState }
  | { kind: "error"; key: MissionKey | null; message: string };

export type EngineEvent =
  | { type: "state-changed"; state: EngineState }
  | { type: "objective-completed"; missionKey: MissionKey; objectiveId: string }
  | { type: "mission-completed"; missionKey: MissionKey }
  | { type: "pty-data"; bytes: Uint8Array }
  | { type: "docker-status"; status: DockerStatus }
  | { type: "validator-error"; message: string }
  /** Fired after `markCommandTaught` has added a new entry. The store should
   *  reflect this in any UI that filters lesson cards (e.g., upcoming
   *  objectives in the same mission whose lesson shares this command). */
  | { type: "command-taught"; command: string }
  /** Live cluster snapshot from the Rust watcher. Fired on every diff -
   *  Chapter 3+ UI subscribes to this to re-render the React Flow graph. */
  | { type: "cluster-updated"; snapshot: ClusterSnapshot };

export type EngineEventType = EngineEvent["type"];
export type EngineListener<T extends EngineEventType = EngineEventType> = (
  event: Extract<EngineEvent, { type: T }>,
) => void;

export type Unsubscribe = () => void;

// ─────────────────────────────────────────────────────────────────────────────
// MissionEngine
// ─────────────────────────────────────────────────────────────────────────────

export class MissionEngine {
  private state: EngineState = { kind: "idle" };
  private listeners = new Map<EngineEventType, Set<EngineListener>>();
  private tauriUnlisteners: UnlistenFn[] = [];
  private wired = false;
  /**
   * In-memory cache of every command the player has been taught a Lesson for.
   * Seeded from SaveState on `init()`, kept authoritative during the session,
   * and persisted on every `markCommandTaught()`.
   *
   * The cache is the engine's snapshot - UI code should read it via
   * `getTaughtCommands()` rather than re-loading the save file each time.
   */
  private taughtCommands: Set<string> = new Set();

  /** Current state snapshot. UI reads this on mount, then subscribes to changes. */
  getState(): EngineState {
    return this.state;
  }

  /**
   * Subscribe to an engine event. Call the returned function to unsubscribe.
   * Idempotent - passing the same listener twice still adds two registrations
   * (matches DOM EventTarget semantics).
   */
  on<T extends EngineEventType>(type: T, listener: EngineListener<T>): Unsubscribe {
    let bucket = this.listeners.get(type);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(type, bucket);
    }
    // The Set is keyed by event-type so each bucket only holds matching listeners,
    // but TS can't see that - store as the wide listener type.
    const wide = listener as unknown as EngineListener;
    bucket.add(wide);
    return () => {
      this.listeners.get(type)?.delete(wide);
    };
  }

  /**
   * Wire up Tauri event listeners and seed the taughtCommands cache from disk.
   * Call once on app startup. Safe to call multiple times - subsequent calls
   * are no-ops.
   */
  async init(): Promise<void> {
    if (this.wired) return;
    this.wired = true;

    // Seed the taughtCommands cache from the persisted save. Failures are
    // non-fatal - a fresh empty set is fine; the player will just see the
    // intro lessons again, which is the correct behaviour on a corrupt save.
    try {
      const save = await loadProgress();
      this.taughtCommands = new Set(save.taughtCommands ?? []);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[engine] could not seed taughtCommands from save:", err);
      this.taughtCommands = new Set();
    }

    this.tauriUnlisteners.push(
      await this.bind("pty:data", (p) => {
        // The Rust side sends bytes as a number[] for JSON serialization. Convert
        // to Uint8Array here so consumers (xterm.js) can write directly.
        const bytes = Uint8Array.from(p.bytes);
        this.emit({ type: "pty-data", bytes });
      }),
      await this.bind("objective:completed", (p) => {
        this.handleObjectiveCompleted(p.objectiveId);
      }),
      await this.bind("mission:completed", (p) => {
        this.handleMissionCompleted(p.key);
      }),
      await this.bind("docker:status", (status) => {
        this.emit({ type: "docker-status", status });
      }),
      await this.bind("validator:error", (p) => {
        this.emit({ type: "validator-error", message: p.message });
      }),
      await this.bind("cluster:update", (snapshot) => {
        this.emit({ type: "cluster-updated", snapshot });
      }),
    );
  }

  /** Stop listening to Tauri events. Mostly useful for hot-reload teardown. */
  async dispose(): Promise<void> {
    for (const unlisten of this.tauriUnlisteners) unlisten();
    this.tauriUnlisteners = [];
    this.listeners.clear();
    this.wired = false;
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  /**
   * Begin (or restart) a mission. Transitions: → loading → playing.
   *
   * After the Rust side returns the MissionState, we override its
   * `taughtCommands` field with the engine's own cache. The Rust copy was
   * read from SaveState at the moment it served the request; the engine's
   * cache is the authoritative *in-session* view (it reflects lessons the
   * player has dismissed since the last save). Both values agree on the
   * happy path - overriding is belt-and-suspenders.
   *
   * Throws on IPC failure but also emits an `error` state so the UI can render.
   */
  async start(key: MissionKey): Promise<MissionState> {
    this.transition({ kind: "loading", key });
    try {
      const fromRust = await invoke<MissionState>("start_mission", { key });
      const mission: MissionState = {
        ...fromRust,
        taughtCommands: [...this.taughtCommands],
      };
      this.transition({ kind: "playing", mission });
      return mission;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.transition({ kind: "error", key, message });
      throw err;
    }
  }

  /** Reveal the next hint for an objective. The Rust side returns the actual hint text. */
  async revealHint(objectiveId: string): Promise<{ text: string }> {
    return await invoke<{ text: string }>("reveal_hint", { objectiveId });
  }

  /** Forward keystrokes from the UI's xterm.js to the PTY in the container. */
  async writePty(bytes: Uint8Array): Promise<void> {
    // Tauri's JSON IPC requires plain arrays. Spread is fine here because the
    // payloads are bounded (one keystroke or a paste of a few KB at most).
    await invoke<void>("write_pty", { bytes: Array.from(bytes) });
  }

  /** Tell the PTY about a terminal resize. xterm.js emits this from FitAddon. */
  async resizePty(cols: number, rows: number): Promise<void> {
    await invoke<void>("resize_pty", { cols, rows });
  }

  /** Nuke and recreate the chapter container. */
  async resetChapter(chapter: ChapterId): Promise<void> {
    await invoke<void>("reset_chapter", { chapter });
    // After a reset we don't auto-restart - the UI decides which mission to
    // jump back to. Drop to idle so the player has to confirm.
    this.transition({ kind: "idle" });
  }

  /** Probe Docker. Used by the first-run wizard. */
  async dockerHealth(): Promise<{ ok: boolean; reason?: string }> {
    return await invoke<{ ok: boolean; reason?: string }>("docker_health");
  }

  /** Ask Rust to enumerate the bundled content/ tree. */
  async listContent(): Promise<{
    chapters: Array<{ id: ChapterId; title: string; missions: MissionKey[] }>;
  }> {
    return await invoke("list_content");
  }

  /**
   * Load save state from disk (with migrations applied). Returns a blank save
   * on first run. Delegates to `save.ts` so versioning lives in one place.
   */
  async loadProgress(): Promise<SaveState> {
    return await loadProgress();
  }

  /** Persist save state to disk. Stamps `lastPlayedAt` to "now" on the way through. */
  async saveProgress(state: SaveState): Promise<void> {
    await saveProgress(state);
  }

  // ── Cluster (Chapter 3+) ──────────────────────────────────────────────────

  /**
   * Snapshot the cluster state once. Used for the initial paint of ClusterView
   * before the watcher's first tick lands. Returns an empty snapshot if no
   * watcher is active. The optional spec lets a caller override the watcher's
   * scope for a one-shot read.
   */
  async getClusterSnapshot(spec?: ClusterViewSpec): Promise<ClusterSnapshot> {
    return await invoke<ClusterSnapshot>("get_cluster_snapshot", { spec });
  }

  /** Lazy `kubectl describe` for a given resource uid. */
  async describeResource(uid: string): Promise<{ text: string }> {
    return await invoke<{ text: string }>("describe_resource", { uid });
  }

  // ── Lessons / taughtCommands ──────────────────────────────────────────────

  /** Snapshot of every command the player has been taught a lesson for. */
  getTaughtCommands(): string[] {
    return [...this.taughtCommands];
  }

  /** True if the given command has already been taught (i.e., its lesson card
   *  should be suppressed). */
  isCommandTaught(command: string): boolean {
    return this.taughtCommands.has(command);
  }

  /**
   * Mark a command as taught - call when the player dismisses a Lesson card.
   * Idempotent: a no-op if the command is already in the set.
   *
   * On a fresh add:
   *   1. Updates the in-memory cache.
   *   2. Patches the active mission's `taughtCommands` so the UI re-renders
   *      with the new set immediately.
   *   3. Emits `command-taught` for store / UI subscribers.
   *   4. Persists by reading the latest SaveState, merging the new command,
   *      and writing back. We re-read rather than relying on a cached copy
   *      so we don't clobber other writes (e.g. mission completion).
   */
  async markCommandTaught(command: string): Promise<void> {
    if (!command) return;
    if (this.taughtCommands.has(command)) return;

    this.taughtCommands.add(command);

    // Patch the active mission so the UI sees the update without waiting for
    // a round-trip through the save file.
    if (this.state.kind === "playing" || this.state.kind === "completing") {
      const next: MissionState = {
        ...this.state.mission,
        taughtCommands: [...this.taughtCommands],
      };
      this.transition({ kind: this.state.kind, mission: next });
    }

    this.emit({ type: "command-taught", command });

    // Persist. Read-modify-write to avoid clobbering other fields the store
    // may have updated since our last load.
    try {
      const cur = await loadProgress();
      const merged = addTaughtCommand(cur, command);
      await saveProgress(merged);
    } catch (err) {
      // Persistence failure isn't fatal - the in-memory state is still
      // correct for the rest of this session. Log so we notice in dev.
      // eslint-disable-next-line no-console
      console.warn("[engine] failed to persist taughtCommands:", err);
    }
  }

  // ── Internal: state transitions ───────────────────────────────────────────

  private transition(next: EngineState): void {
    this.state = next;
    this.emit({ type: "state-changed", state: next });
  }

  private handleObjectiveCompleted(objectiveId: string): void {
    if (this.state.kind !== "playing") {
      // Late event from a previous mission - emit but don't mutate state.
      this.emit({
        type: "objective-completed",
        missionKey: keyOfMaybe(this.state) ?? "",
        objectiveId,
      });
      return;
    }

    const mission = this.state.mission;
    const updated = mission.objectives.map((o): Objective =>
      o.id === objectiveId && !o.completed ? { ...o, completed: true } : o,
    );
    const next: MissionState = { ...mission, objectives: updated };

    const allDone = updated.every((o) => o.completed);
    this.transition(
      allDone
        ? { kind: "completing", mission: next }
        : { kind: "playing", mission: next },
    );
    this.emit({ type: "objective-completed", missionKey: mission.key, objectiveId });
  }

  private handleMissionCompleted(key: MissionKey): void {
    // Defensive: if Rust signals completion before all objectives ticked
    // (e.g. a check.sh that bypasses the per-objective markers), still flip
    // to 'completing' so the UI plays the outro.
    if (this.state.kind === "playing" || this.state.kind === "completing") {
      const mission = this.state.mission;
      const allTicked = mission.objectives.map((o) => ({ ...o, completed: true }));
      this.transition({
        kind: "completing",
        mission: { ...mission, objectives: allTicked },
      });
    }
    this.emit({ type: "mission-completed", missionKey: key });
  }

  // ── Internal: emitter plumbing ────────────────────────────────────────────

  private async bind<C extends EventChannel>(
    channel: C,
    handler: (payload: EventPayload<C>) => void,
  ): Promise<UnlistenFn> {
    return await listen<EventPayload<C>>(channel, (e) => handler(e.payload));
  }

  private emit(event: EngineEvent): void {
    const bucket = this.listeners.get(event.type);
    if (!bucket) return;
    // Snapshot so a listener that unsubscribes itself doesn't skip the next.
    for (const listener of [...bucket]) {
      try {
        // bucket only contains listeners registered for this event type.
        (listener as (e: EngineEvent) => void)(event);
      } catch (err) {
        // Swallow listener errors - one broken UI subscriber shouldn't poison
        // the engine for the rest. Log so we notice in dev.
        // eslint-disable-next-line no-console
        console.error("[engine] listener threw:", err);
      }
    }
  }
}

function keyOfMaybe(s: EngineState): MissionKey | null {
  if (s.kind === "playing" || s.kind === "completing") return s.mission.key;
  if (s.kind === "loading" || s.kind === "error") return s.key;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────
//
// One engine per app process. The store + scenes import this singleton rather
// than instantiating their own.

export const engine = new MissionEngine();
