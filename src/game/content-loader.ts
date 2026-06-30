// Content loader - reads bundled mission YAML + dialogue Markdown from `content/`
// and validates each file against a zod schema.
//
// Implementation note: we use Vite's `import.meta.glob` with `?raw` so all
// content is bundled at build time. That means:
//   - No runtime FS permissions needed.
//   - Same code path in `pnpm dev` and a packaged `.dmg`.
//   - The content/ tree drives the bundle - adding a mission folder is enough
//     to ship it (after a rebuild).
//
// Shell scripts (setup.sh / check.sh) are *also* loaded as raw strings so the
// engine can hand them off to the Rust side for execution inside the
// container. The frontend itself never executes them.

import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { ChapterId, MissionKey } from "../ipc/contract";
import { missionKey } from "../ipc/contract";

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

/** Hints are ordered shallowest → deepest. Authors must give at least one. */
const hintSchema = z.array(z.string().min(1)).min(1);

/** A worked example shown inside a Lesson card. Mirrors `LessonExample` in
 *  `src/ipc/contract.ts`. */
const lessonExampleSchema = z.object({
  input: z.string().min(1),
  output: z.string().optional(),
  note: z.string().optional(),
});

/** Teaching content shown before the player attempts an objective. The
 *  `command` field is the canonical dedupe key - once a player has been
 *  taught a command, lessons with the same key are suppressed in later
 *  objectives. Mirrors `Lesson` in `src/ipc/contract.ts`. */
const lessonSchema = z.object({
  command: z.string().min(1),
  summary: z.string().min(1),
  syntax: z.string().optional(),
  examples: z.array(lessonExampleSchema).min(1),
});

const objectiveSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/, "objective id must be lowercase letters / digits / underscore"),
  label: z.string().min(1),
  /**
   * Marker file path the validator checks. Optional - defaults to
   * `/tmp/.cosmos/<id>` matching the `check.sh` convention.
   */
  check: z.string().min(1).optional(),
  hints: hintSchema,
  /** Optional teaching card. The engine suppresses it if `lesson.command` is
   *  already in `SaveState.taughtCommands`. */
  lesson: lessonSchema.optional(),
});

/** Kubernetes resource kinds the cluster watcher knows how to normalize.
 *  Mirrors `K8sKind` in `src/ipc/contract.ts`. */
const k8sKindSchema = z.union([
  z.literal("namespace"),
  z.literal("node"),
  z.literal("deployment"),
  z.literal("replicaset"),
  z.literal("pod"),
  z.literal("service"),
  z.literal("configmap"),
  z.literal("secret"),
  // ── Flux CRDs (Chapter 4) ──
  z.literal("gitrepository"),
  z.literal("kustomization"),
]);

/** Cluster view spec - only meaningful on Chapter 3+ (k8s/flux) missions.
 *  Snake-case here matches the YAML authoring convention; the Rust side
 *  serde-renames it to camelCase for the IPC contract's `ClusterViewSpec`. */
const clusterViewSchema = z.object({
  /** If set, scope the watcher to one namespace (plus cluster-scoped kinds).
   *  Omitted = all namespaces. */
  watch_namespace: z.string().min(1).optional(),
  /** Subset of kinds to watch. Omitted = a sensible default
   *  (deployment, replicaset, pod, service). */
  watch_kinds: z.array(k8sKindSchema).min(1).optional(),
  /** Polling cadence in milliseconds. Default 2000, floor 500 enforced by Rust. */
  poll_interval_ms: z.number().int().positive().optional(),
});

const chapterIdSchema = z.union([
  z.literal("ch01"),
  z.literal("ch02"),
  z.literal("ch03"),
  z.literal("ch04"),
]);

const missionYamlSchema = z.object({
  id: z.string().regex(/^ch\d{2}\.m\d{2}/, "mission id must look like ch01.m01-…"),
  title: z.string().min(1),
  chapter: z.number().int().min(1).max(4),
  order: z.number().int().min(1),
  /** Container image tag. Must match what's built by `scripts/build-images.sh`. */
  container_image: z.string().min(1),
  /** File name of the setup script in this mission's directory. Defaults to `setup.sh`. */
  setup: z.string().default("setup.sh"),
  /** File name of the check script. Defaults to `check.sh`. */
  check: z.string().default("check.sh"),
  /** File name of the intro dialogue markdown. Defaults to `dialogue.md`. */
  intro_dialogue: z.string().default("dialogue.md"),
  /** File name of the outro dialogue markdown. Defaults to `outro.md`. */
  outro_dialogue: z.string().default("outro.md"),
  objectives: z.array(objectiveSchema).min(1),
  /** Optional: short hint shown on the chapter map. */
  summary: z.string().optional(),
  /** Optional cluster-view spec for Chapter 3+ missions. When present, the
   *  Rust side starts a `cluster:update` polling loop scoped to this spec
   *  and the UI switches to the viz-primary layout. */
  cluster_view: clusterViewSchema.optional(),
});

export type MissionYaml = z.infer<typeof missionYamlSchema>;
export type ObjectiveYaml = z.infer<typeof objectiveSchema>;
export type LessonYaml = z.infer<typeof lessonSchema>;
export type LessonExampleYaml = z.infer<typeof lessonExampleSchema>;
export type ClusterViewYaml = z.infer<typeof clusterViewSchema>;
export type K8sKindYaml = z.infer<typeof k8sKindSchema>;

const chapterYamlSchema = z.object({
  id: chapterIdSchema,
  title: z.string().min(1),
  order: z.number().int().min(1).max(4),
  intro: z.string().optional(), // markdown body inline
  summary: z.string().optional(),
});
export type ChapterYaml = z.infer<typeof chapterYamlSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// In-memory shape
// ─────────────────────────────────────────────────────────────────────────────

export interface LoadedMission {
  key: MissionKey;
  chapter: ChapterId;
  /** Folder slug, e.g. "mission-01-first-steps". */
  slug: string;
  yaml: MissionYaml;
  introMarkdown: string;
  outroMarkdown: string;
  /** Raw setup.sh contents. Handed to the Rust side to run inside the container. */
  setupScript: string;
  /** Raw check.sh contents. Same - runs every 2s on the Rust side. */
  checkScript: string;
}

export interface LoadedChapter {
  id: ChapterId;
  yaml: ChapterYaml;
  missions: LoadedMission[];
  /** Raw markdown of the chapter's theoretical course (`content/<chapter>/course.md`),
   *  if authored. Rendered by CourseScene. */
  courseMarkdown?: string;
}

export interface ContentBundle {
  chapters: LoadedChapter[];
  /** Fast lookup: missionKey → mission. */
  byKey: Map<MissionKey, LoadedMission>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vite glob imports
// ─────────────────────────────────────────────────────────────────────────────
//
// All content files baked into the bundle at build time. We pull them in eagerly
// because the player should be able to navigate the chapter map immediately on
// app start without async hops.
//
// The glob keys are absolute-ish paths starting with `/content/...` (Vite
// rewrites the relative path).

type RawTree = Record<string, string>;

const rawMissionYaml = import.meta.glob("/content/*/mission-*/mission.yaml", {
  eager: true,
  query: "?raw",
  import: "default",
}) as RawTree;

const rawDialogueMd = import.meta.glob("/content/*/mission-*/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as RawTree;

const rawShellScripts = import.meta.glob("/content/*/mission-*/*.sh", {
  eager: true,
  query: "?raw",
  import: "default",
}) as RawTree;

const rawChapterYaml = import.meta.glob("/content/*/chapter.yaml", {
  eager: true,
  query: "?raw",
  import: "default",
}) as RawTree;

// Per-chapter theoretical course (one optional course.md per chapter folder).
// Distinct from mission dialogue (which globs /content/*/mission-*/*.md).
const rawCourseMarkdown = import.meta.glob("/content/*/course.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as RawTree;

// ─────────────────────────────────────────────────────────────────────────────
// Loader
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse + validate every bundled mission. Throws on the first schema error -
 * the team treats invalid content as a build failure, not a runtime warning.
 *
 * Cached: the result is computed once and re-used on subsequent calls.
 */
let cached: ContentBundle | null = null;

export function loadContent(): ContentBundle {
  if (cached) return cached;

  const chapters = new Map<ChapterId, LoadedChapter>();

  // 1. Chapters first so missions can attach to them.
  for (const [path, raw] of Object.entries(rawChapterYaml)) {
    const folder = chapterFolderFromPath(path);
    const parsed = chapterYamlSchema.safeParse(parseYaml(raw));
    if (!parsed.success) {
      throw contentError(path, parsed.error);
    }
    chapters.set(parsed.data.id, {
      id: parsed.data.id,
      yaml: parsed.data,
      missions: [],
      courseMarkdown: rawCourseMarkdown[`/content/${folder}/course.md`],
    });
    // We don't strictly need `folder` here, but keep it to sanity-check that
    // chapter.yaml's id matches the folder.
    void folder;
  }

  // 2. Missions.
  for (const [path, raw] of Object.entries(rawMissionYaml)) {
    const { chapterFolder, missionFolder } = missionFoldersFromPath(path);
    const parsed = missionYamlSchema.safeParse(parseYaml(raw));
    if (!parsed.success) {
      throw contentError(path, parsed.error);
    }
    const yaml = parsed.data;
    const chapter = chapterIdFromOrder(yaml.chapter);

    if (!chapters.has(chapter)) {
      throw new Error(
        `Mission ${path} declares chapter=${yaml.chapter} but no content/${chapterFolder}/chapter.yaml was found.`,
      );
    }

    const slug = missionFolder; // e.g. "mission-01-first-steps"
    const key = missionKey({ chapter, slug });

    const introPath = `/content/${chapterFolder}/${missionFolder}/${yaml.intro_dialogue}`;
    const outroPath = `/content/${chapterFolder}/${missionFolder}/${yaml.outro_dialogue}`;
    const setupPath = `/content/${chapterFolder}/${missionFolder}/${yaml.setup}`;
    const checkPath = `/content/${chapterFolder}/${missionFolder}/${yaml.check}`;

    const introMarkdown = rawDialogueMd[introPath] ?? "";
    const outroMarkdown = rawDialogueMd[outroPath] ?? "";
    const setupScript = rawShellScripts[setupPath] ?? "";
    const checkScript = rawShellScripts[checkPath] ?? "";

    if (!introMarkdown) {
      throw new Error(`Mission ${key}: intro dialogue not found at ${introPath}`);
    }
    if (!outroMarkdown) {
      throw new Error(`Mission ${key}: outro dialogue not found at ${outroPath}`);
    }
    if (!setupScript) {
      throw new Error(`Mission ${key}: setup script not found at ${setupPath}`);
    }
    if (!checkScript) {
      throw new Error(`Mission ${key}: check script not found at ${checkPath}`);
    }

    chapters.get(chapter)!.missions.push({
      key,
      chapter,
      slug,
      yaml,
      introMarkdown,
      outroMarkdown,
      setupScript,
      checkScript,
    });
  }

  // 3. Sort missions inside each chapter by `order`, sort chapters by `order`.
  const sortedChapters = [...chapters.values()].sort(
    (a, b) => a.yaml.order - b.yaml.order,
  );
  for (const ch of sortedChapters) {
    ch.missions.sort((a, b) => a.yaml.order - b.yaml.order);
  }

  // 4. Build the lookup map.
  const byKey = new Map<MissionKey, LoadedMission>();
  for (const ch of sortedChapters) {
    for (const m of ch.missions) byKey.set(m.key, m);
  }

  cached = { chapters: sortedChapters, byKey };
  return cached;
}

/** Convenience: get a single mission by key, or undefined. */
export function getMission(key: MissionKey): LoadedMission | undefined {
  return loadContent().byKey.get(key);
}

/** Walk the chapters in order. */
export function listChapters(): LoadedChapter[] {
  return loadContent().chapters;
}

/** Raw course markdown for a chapter, or undefined if no course.md is bundled. */
export function getCourse(chapter: ChapterId): string | undefined {
  return loadContent().chapters.find((c) => c.id === chapter)?.courseMarkdown;
}

/**
 * Find the next mission after the given key (within or across chapters). Returns
 * `null` if the player has just finished the last mission of the last chapter.
 */
export function nextMissionAfter(key: MissionKey): MissionKey | null {
  const chapters = listChapters();
  for (let ci = 0; ci < chapters.length; ci++) {
    const ch = chapters[ci];
    const idx = ch.missions.findIndex((m) => m.key === key);
    if (idx === -1) continue;
    if (idx + 1 < ch.missions.length) return ch.missions[idx + 1].key;
    // End of this chapter - peek into the next chapter.
    const nextCh = chapters[ci + 1];
    return nextCh && nextCh.missions[0] ? nextCh.missions[0].key : null;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function missionFoldersFromPath(path: string): {
  chapterFolder: string;
  missionFolder: string;
} {
  // path looks like "/content/chapter-01-terminal/mission-01-first-steps/mission.yaml"
  const parts = path.split("/").filter(Boolean);
  // ["content", "chapter-XX-…", "mission-NN-…", "mission.yaml"]
  if (parts.length < 4) throw new Error(`Unexpected mission path: ${path}`);
  return { chapterFolder: parts[1], missionFolder: parts[2] };
}

function chapterFolderFromPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 3) throw new Error(`Unexpected chapter path: ${path}`);
  return parts[1];
}

function chapterIdFromOrder(order: number): ChapterId {
  if (order === 1) return "ch01";
  if (order === 2) return "ch02";
  if (order === 3) return "ch03";
  if (order === 4) return "ch04";
  throw new Error(`Chapter order ${order} is out of range (expected 1–4).`);
}

function contentError(path: string, err: z.ZodError): Error {
  const issues = err.issues
    .map((i) => `  • ${i.path.join(".") || "<root>"}: ${i.message}`)
    .join("\n");
  return new Error(`Content validation failed for ${path}:\n${issues}`);
}
