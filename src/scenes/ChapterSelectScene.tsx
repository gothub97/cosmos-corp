/**
 * ChapterSelectScene - the chapter hub. Lists every chapter with its title,
 * a one-line blurb, and the player's progress, and lets them drop into any
 * chapter's mission map.
 *
 * This is intentionally permissive: chapters aren't hard-locked behind one
 * another, so it doubles as the "jump straight to chapter N" affordance the
 * Title screen used to expose via small dev buttons. Progress is read from
 * the real save (`completedMissions`), not synthesized.
 */

import { useMemo } from "react";
import { useGameStore } from "../game/store";
import { getCourse, listChapters } from "../game/content-loader";
import type { ChapterId, MissionKey } from "../ipc/contract";

const ORDINALS: Record<ChapterId, string> = {
  ch01: "Chapter One",
  ch02: "Chapter Two",
  ch03: "Chapter Three",
  ch04: "Chapter Four",
};

const CHAPTER_TITLE_FALLBACKS: Record<ChapterId, string> = {
  ch01: "The Terminal",
  ch02: "The Codebase",
  ch03: "The Cluster",
  ch04: "The GitOps Loop",
};

const CHAPTER_SUMMARY_FALLBACKS: Record<ChapterId, string> = {
  ch01: "Live in the shell. Navigate, inspect, and move with confidence.",
  ch02: "Git as a careful little notebook - branch, commit, and collaborate.",
  ch03: "Talk to a real Kubernetes cluster with one CLI.",
  ch04: "Let git drive the cluster. Push a commit, watch the world reshape.",
};

interface ChapterCard {
  id: ChapterId;
  ordinal: string;
  title: string;
  summary: string;
  total: number;
  done: number;
}

type CardStatus = "complete" | "in-progress" | "not-started";

function statusOf(card: ChapterCard): CardStatus {
  if (card.total > 0 && card.done >= card.total) return "complete";
  if (card.done > 0) return "in-progress";
  return "not-started";
}

const STATUS_LABEL: Record<CardStatus, string> = {
  complete: "Complete",
  "in-progress": "In progress",
  "not-started": "Not started",
};

export default function ChapterSelectScene() {
  const goTo = useGameStore((s) => s.goTo);
  const save = useGameStore((s) => s.save);
  const storeChapters = useGameStore((s) => s.chapters);

  const completed = useMemo(
    () => new Set<MissionKey>(save?.completedMissions ?? []),
    [save?.completedMissions],
  );

  const cards: ChapterCard[] = useMemo(() => {
    // Prefer the bundled content (drives real titles/summaries + mission keys).
    // Fall back to the Rust-reported chapter list if bundling produced nothing.
    const loaded = listChapters();
    const source: { id: ChapterId; title?: string; summary?: string; missions: MissionKey[] }[] =
      loaded.length > 0
        ? loaded.map((c) => ({
            id: c.id,
            title: c.yaml.title,
            summary: c.yaml.summary,
            missions: c.missions.map((m) => m.key),
          }))
        : storeChapters.map((c) => ({
            id: c.id,
            title: c.title,
            summary: undefined,
            missions: c.missions,
          }));

    return source.map((c) => ({
      id: c.id,
      ordinal: ORDINALS[c.id] ?? c.id.toUpperCase(),
      title: c.title ?? CHAPTER_TITLE_FALLBACKS[c.id] ?? c.id,
      summary: c.summary ?? CHAPTER_SUMMARY_FALLBACKS[c.id] ?? "",
      total: c.missions.length,
      done: c.missions.filter((k) => completed.has(k)).length,
    }));
  }, [storeChapters, completed]);

  return (
    <main className="mx-auto flex min-h-full max-w-4xl flex-col gap-6 p-8">
      <nav className="flex items-center justify-between text-xs text-cosmos-muted">
        <button
          type="button"
          onClick={() => goTo({ kind: "title" })}
          className="rounded px-2 py-1 hover:text-phosphor-400"
        >
          ← Title
        </button>
      </nav>

      <header className="text-center">
        <p className="font-mono text-xs uppercase tracking-[0.4em] text-phosphor-400">
          Cosmos Corp
        </p>
        <h1 className="cosmos-glow mt-2 text-3xl font-semibold text-cosmos-text">
          Choose a chapter
        </h1>
        <p className="mt-2 text-sm text-cosmos-muted">
          Pick up where you left off, or jump ahead to any chapter.
        </p>
      </header>

      {cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-cosmos-border bg-cosmos-panel/60 p-8 text-center text-sm text-cosmos-muted">
          No chapters discovered yet. Once content is bundled, they'll appear here.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {cards.map((card) => {
            const status = statusOf(card);
            const pct = card.total > 0 ? Math.round((card.done / card.total) * 100) : 0;
            const hasCourse = !!getCourse(card.id);
            return (
              <li key={card.id}>
                <div
                  className={
                    "group flex h-full w-full flex-col gap-3 rounded-lg border " +
                    "border-cosmos-border bg-cosmos-panel-2 p-5 transition-colors " +
                    "hover:border-phosphor-600/50 hover:bg-cosmos-panel-2/80"
                  }
                >
                  <button
                    type="button"
                    onClick={() => goTo({ kind: "chapter-map", chapter: card.id })}
                    className="flex w-full flex-col gap-3 text-left"
                  >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-widest text-cosmos-muted">
                        {card.ordinal}
                      </p>
                      <h2 className="mt-1 text-xl font-semibold text-cosmos-text group-hover:text-phosphor-200">
                        {card.title}
                      </h2>
                    </div>
                    <span
                      className={
                        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest " +
                        (status === "complete"
                          ? "border-phosphor-600/50 text-phosphor-400"
                          : status === "in-progress"
                            ? "border-amber-cursor/50 text-amber-cursor"
                            : "border-cosmos-border text-cosmos-muted")
                      }
                    >
                      {STATUS_LABEL[status]}
                    </span>
                  </div>

                  <p className="text-sm text-cosmos-muted">{card.summary}</p>

                  <div className="mt-auto">
                    <div className="flex items-center justify-between text-xs text-cosmos-muted">
                      <span>
                        {card.done} / {card.total} mission{card.total === 1 ? "" : "s"}
                      </span>
                      <span aria-hidden="true" className="text-phosphor-400 opacity-0 transition-opacity group-hover:opacity-100">
                        Open →
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-cosmos-border/40">
                      <div
                        className="h-full rounded-full bg-phosphor-500/70 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  </button>
                  {hasCourse && (
                    <button
                      type="button"
                      onClick={() => goTo({ kind: "course", chapter: card.id })}
                      className="self-start text-xs text-cosmos-muted transition-colors hover:text-phosphor-400"
                    >
                      📖 Read the theory
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
