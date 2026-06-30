/**
 * ChapterMapScene - between the chapter intro and the per-mission play. The
 * player picks a mission (or replays a completed one).
 */

import { useEffect, useMemo, useState } from "react";
import ChapterMap, { type MissionNode } from "../components/ChapterMap";
import { useGameStore, selectChapter } from "../game/store";
import { getCourse, getMission, listChapters } from "../game/content-loader";
import type { ChapterId } from "../ipc/contract";

const CHAPTER_TITLE_FALLBACKS: Record<ChapterId, string> = {
  ch01: "The Terminal",
  ch02: "The Codebase",
  ch03: "The Cluster",
  ch04: "The GitOps Loop",
};

export interface ChapterMapSceneProps {
  chapter: ChapterId;
}

export default function ChapterMapScene({ chapter }: ChapterMapSceneProps) {
  const summary = useGameStore(selectChapter(chapter));
  const save = useGameStore((s) => s.save);
  const startMission = useGameStore((s) => s.startMission);
  const goTo = useGameStore((s) => s.goTo);
  const resetChapter = useGameStore((s) => s.resetChapter);

  const completed = useMemo(
    () => new Set(save?.completedMissions ?? []),
    [save?.completedMissions],
  );

  // The chapter's theoretical course is shown automatically the first time the
  // player lands here (every entry path passes through the map). Once read
  // (tracked in save.coursesRead), it's only re-opened via the button below.
  const courseExists = useMemo(() => !!getCourse(chapter), [chapter]);
  const courseRead = save?.coursesRead.includes(chapter) ?? false;
  const needsCourse = courseExists && !courseRead;
  useEffect(() => {
    if (needsCourse) goTo({ kind: "course", chapter });
  }, [needsCourse, chapter, goTo]);

  // "Reset chapter" UX: a two-step inline confirm + busy/done feedback, so the
  // button visibly does something (the actual reset wipes this chapter's
  // progress and tears down the sandbox in the store action).
  const [resetState, setResetState] = useState<
    "idle" | "confirm" | "busy" | "done"
  >("idle");
  const [resetError, setResetError] = useState<string | null>(null);

  // Auto-revert the transient states.
  useEffect(() => {
    if (resetState === "confirm") {
      const t = setTimeout(() => setResetState("idle"), 4000);
      return () => clearTimeout(t);
    }
    if (resetState === "done") {
      const t = setTimeout(() => setResetState("idle"), 2500);
      return () => clearTimeout(t);
    }
  }, [resetState]);
  // Reset the confirm state if the player navigates between chapters.
  useEffect(() => {
    setResetState("idle");
    setResetError(null);
  }, [chapter]);

  const onResetClick = async () => {
    setResetError(null);
    if (resetState === "idle") {
      setResetState("confirm");
      return;
    }
    if (resetState === "confirm") {
      setResetState("busy");
      try {
        await resetChapter(chapter);
        setResetState("done");
      } catch (err) {
        setResetState("idle");
        setResetError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  // Prefer the bundled chapter list (drives titles + summaries from YAML); fall
  // back to the Rust-reported store summary if content-loader hasn't been
  // evaluated yet (e.g. failed bundling).
  const loadedChapter = useMemo(
    () => listChapters().find((c) => c.id === chapter),
    [chapter],
  );

  const title =
    loadedChapter?.yaml.title ??
    summary?.title ??
    CHAPTER_TITLE_FALLBACKS[chapter] ??
    chapter;

  const missionKeys = useMemo(
    () =>
      loadedChapter
        ? loadedChapter.missions.map((m) => m.key)
        : (summary?.missions ?? []),
    [loadedChapter, summary?.missions],
  );

  const nodes: MissionNode[] = useMemo(() => {
    let foundCurrent = false;
    return missionKeys.map((key, idx) => {
      const isDone = completed.has(key);
      let status: MissionNode["status"];
      if (isDone) status = "completed";
      else if (!foundCurrent) {
        status = "current";
        foundCurrent = true;
      } else status = "locked";

      // First mission is always available even before a current pointer.
      if (idx === 0 && status === "locked") status = "available";

      // Prefer the authoritative title from the YAML; fall back to a
      // human-readable form of the slug if content isn't bundled yet.
      const loaded = getMission(key);
      const fallbackTitle = (key.split(".").slice(1).join(".") || `m${idx + 1}`)
        .replace(/^m\d+-/, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      return {
        key,
        title: loaded?.yaml.title ?? fallbackTitle ?? key,
        summary: loaded?.yaml.summary,
        status,
      };
    });
  }, [missionKeys, completed]);

  // While redirecting to the first-time course, render nothing (avoids a flash
  // of the map before the course opens).
  if (needsCourse) return null;

  return (
    <main className="mx-auto flex min-h-full max-w-5xl flex-col gap-6 p-8">
      <nav className="flex items-center justify-between text-xs text-cosmos-muted">
        <button
          type="button"
          onClick={() => goTo({ kind: "title" })}
          className="rounded px-2 py-1 hover:text-phosphor-400"
        >
          ← Title
        </button>
        <div className="flex items-center gap-2">
          {courseExists && (
            <button
              type="button"
              onClick={() => goTo({ kind: "course", chapter })}
              className="rounded px-2 py-1 hover:text-phosphor-400"
              title="Read the chapter's theory course."
            >
              📖 Read the theory
            </button>
          )}
          <button
            type="button"
            onClick={() => void onResetClick()}
            disabled={resetState === "busy"}
            className={
              "rounded px-2 py-1 transition-colors disabled:opacity-60 " +
              (resetState === "confirm"
                ? "text-danger hover:text-danger/80"
                : resetState === "done"
                  ? "text-phosphor-400"
                  : "text-amber-cursor hover:text-amber-cursor/80")
            }
            title="Reset this chapter: clears its mission progress and tears down the sandbox container."
          >
            {resetState === "idle" && "Reset chapter"}
            {resetState === "confirm" && "Click again to confirm reset"}
            {resetState === "busy" && "Resetting…"}
            {resetState === "done" && "✓ Chapter reset"}
          </button>
        </div>
      </nav>

      {resetError && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          Could not reset chapter: {resetError}
        </p>
      )}

      {missionKeys.length === 0 ? (
        <div className="rounded-lg border border-dashed border-cosmos-border bg-cosmos-panel/60 p-8 text-center">
          <h2 className="cosmos-glow text-2xl font-semibold text-cosmos-text">
            {title}
          </h2>
          <p className="mt-3 text-sm text-cosmos-muted">
            No missions discovered yet for this chapter. The mission engine is
            still being wired - once content is bundled, this map populates
            automatically.
          </p>
        </div>
      ) : (
        <ChapterMap
          chapterId={chapter}
          chapterTitle={title}
          subtitle="Click an unlocked mission to begin."
          missions={nodes}
          onSelect={(key) => void startMission(key)}
        />
      )}
    </main>
  );
}
