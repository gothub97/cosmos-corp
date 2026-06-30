// IPC contract between the React frontend and the Rust backend.
// This file is the single source of truth - Stream A (Rust) and Stream B (React)
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

/** A worked example shown inside a Lesson card. */
export interface LessonExample {
  /** What the player would type, e.g. "pwd" - rendered with a leading "$". */
  input: string;
  /** Expected output. Multi-line is fine. Optional (some commands have no output). */
  output?: string;
  /** Optional one-liner explaining why this example matters. */
  note?: string;
}

/**
 * Teaching content shown BEFORE the player attempts an objective. Beginners need
 * to see the command and a worked example, not infer it from progressive hints.
 *
 * The `command` field is the *canonical* identifier the engine uses to suppress
 * repeats - once a player has been taught `ls`, later objectives whose lesson
 * has `command: "ls"` will skip the card and unlock the terminal immediately.
 */
export interface Lesson {
  /** Canonical command name used for "already taught" tracking, e.g. "pwd",
   *  "ls", "|", "find", ">>". For multi-piece lessons, pick the most specific. */
  command: string;
  /** One-line "what it does" written for a beginner. */
  summary: string;
  /** Optional formal syntax line, e.g. "ls [OPTIONS] [PATH]". */
  syntax?: string;
  /** 1+ worked examples. The first one should be the simplest. */
  examples: LessonExample[];
}

export interface Objective {
  id: string;
  label: string;
  /** True once the validator has confirmed completion. */
  completed: boolean;
  /** Number of hints already revealed (0 = none). */
  hintsRevealed: number;
  /** Optional teaching card shown before the objective unlocks. Suppressed by
   *  the engine if the lesson's `command` is already in `taughtCommands`. */
  lesson?: Lesson;
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
  /** Snapshot of all commands the player has been taught up to (and including)
   *  this mission's start. Used by the UI to decide whether to show each
   *  objective's lesson card. */
  taughtCommands: string[];
  /** Optional cluster visualization spec - only set on Kubernetes / FluxCD
   *  missions. When present, the UI switches to the viz-primary layout
   *  (cluster on top, terminal docked at bottom) and the Rust side starts
   *  a `cluster:update` polling loop scoped to this spec. */
  clusterView?: ClusterViewSpec;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cluster view (Chapter 3+)
// ─────────────────────────────────────────────────────────────────────────────

/** Kubernetes resource kinds the watcher knows how to normalize.
 *  `gitrepository` / `kustomization` are Flux CRDs (Chapter 4). */
export type K8sKind =
  | "namespace"
  | "node"
  | "deployment"
  | "replicaset"
  | "pod"
  | "service"
  | "configmap"
  | "secret"
  | "gitrepository"
  | "kustomization";

/**
 * One row in a cluster snapshot. Normalized across kinds so the React Flow
 * graph can render generically. Kind-specific fields are all optional and
 * populated only when relevant to that kind (e.g. `replicas` on Deployment,
 * `selector` + `ports` on Service, `containerStatuses` on Pod).
 */
export interface K8sResource {
  kind: K8sKind;
  /** Stable Kubernetes UID - used as the React Flow node id. */
  uid: string;
  name: string;
  /** Omitted for cluster-scoped kinds (Namespace, Node). */
  namespace?: string;
  /** Normalized human-readable status: Running | Pending | Failed |
   *  CrashLoopBackOff | Ready | NotReady | Succeeded | Terminating |
   *  Reconciling | Stalled | Suspended (Flux CRDs) | … */
  status?: string;
  /** Owner references - used to draw ownership edges in the graph
   *  (Deployment → ReplicaSet → Pod). */
  ownerRefs?: { kind: string; name: string; uid: string }[];

  // ── Deployment / ReplicaSet ──
  replicas?: { desired: number; ready: number; available: number };

  // ── Service ──
  selector?: Record<string, string>;
  ports?: Array<{
    port: number;
    targetPort: number | string;
    protocol: string;
    nodePort?: number;
  }>;
  serviceType?: "ClusterIP" | "NodePort" | "LoadBalancer" | "ExternalName";

  // ── Pod ──
  labels?: Record<string, string>;
  podIP?: string;
  nodeName?: string;
  containerStatuses?: Array<{
    name: string;
    ready: boolean;
    restartCount: number;
    /** Loose state string: "running" | "waiting:CrashLoopBackOff" | "terminated:Completed" | … */
    state: string;
  }>;

  // ── Flux (Kustomization) ──
  /** `.spec.sourceRef.name` - the GitRepository a Kustomization reconciles
   *  from. Used to draw the Kustomization → GitRepository edge. */
  sourceRef?: string;

  /** Wallclock seconds since creation, computed from creationTimestamp. */
  ageSeconds?: number;
}

export interface ClusterSnapshot {
  /** Keyed by resource uid. */
  resources: Record<string, K8sResource>;
  /** Monotonically increasing per watcher session - used for diffing. */
  version: number;
  /** ISO 8601 UTC timestamp when the snapshot was sampled. */
  sampledAt: string;
}

export interface ClusterViewSpec {
  /** If set, only resources in this namespace (plus cluster-scoped kinds like
   *  Node and Namespace itself) are watched. Null/omitted = all namespaces. */
  watchNamespace?: string;
  /** If set, only these kinds are watched. Null/omitted = a sensible default
   *  set: deployment, replicaset, pod, service. */
  watchKinds?: K8sKind[];
  /** Polling cadence in milliseconds. Default 2000. Floor enforced by the
   *  Rust side at ~500ms to avoid kubectl thrash. */
  pollIntervalMs?: number;
}

/** The player's identity, captured during first-launch onboarding. An empty
 *  `firstName` is the canonical "has not onboarded yet" signal. */
export interface PlayerProfile {
  firstName: string;
  lastName: string;
  /** Chosen callsign / job title, e.g. "Platform Intern". */
  role: string;
  /** Generated at onboarding, e.g. "CC-7F3A2". */
  employeeId: string;
  /** ISO timestamp the player completed onboarding; also the badge start date.
   *  Empty string until onboarding finishes. */
  onboardedAt: string;
}

export interface SaveState {
  /** Schema version for migrations. v2 added `taughtCommands`; v3 added
   *  `coursesRead`; v4 added `profile`. */
  version: 4;
  currentMission: MissionKey | null;
  completedMissions: MissionKey[];
  /** Per-objective, the number of hints the player has revealed. */
  hintsByObjective: Record<string, number>;
  /** Canonical names of every command the player has seen a lesson for.
   *  Used to skip redundant lessons in later missions. */
  taughtCommands: string[];
  /** Chapters whose theoretical course has been read at least once. Drives the
   *  "auto-open the course the first time you enter a chapter" behaviour. */
  coursesRead: ChapterId[];
  /** Who the player is. Captured in the first-launch onboarding wizard. */
  profile: PlayerProfile;
  lastPlayedAt: string;
}

/** v1 → v2 migration: the persisted shape pre-dating `taughtCommands`. */
export interface SaveStateV1 {
  version: 1;
  currentMission: MissionKey | null;
  completedMissions: MissionKey[];
  hintsByObjective: Record<string, number>;
  lastPlayedAt: string;
}

/** v2 → v3 migration: the persisted shape pre-dating `coursesRead`. */
export interface SaveStateV2 {
  version: 2;
  currentMission: MissionKey | null;
  completedMissions: MissionKey[];
  hintsByObjective: Record<string, number>;
  taughtCommands: string[];
  lastPlayedAt: string;
}

/** v3 → v4 migration: the persisted shape pre-dating `profile`. */
export interface SaveStateV3 {
  version: 3;
  currentMission: MissionKey | null;
  completedMissions: MissionKey[];
  hintsByObjective: Record<string, number>;
  taughtCommands: string[];
  coursesRead: ChapterId[];
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

  // ── Cluster (Chapter 3+) ──

  /** Snapshot the current cluster state once. Used for the initial render
   *  before the watcher's first tick lands. Returns an empty snapshot if no
   *  watcher is active. */
  get_cluster_snapshot: (args?: { spec?: ClusterViewSpec }) => Promise<ClusterSnapshot>;

  /** Lazy `kubectl describe` for a given resource. Returns the raw text. */
  describe_resource: (args: { uid: string }) => Promise<{ text: string }>;
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
  | { channel: "validator:error"; payload: { message: string } }
  | { channel: "cluster:update"; payload: ClusterSnapshot };

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
