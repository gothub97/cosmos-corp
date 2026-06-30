/**
 * CourseScene - the per-chapter theoretical course (the "read the theory"
 * companion to the hands-on missions).
 *
 * Shown automatically the first time a player enters a chapter (see the
 * redirect in ChapterMapScene), and re-readable any time from the chapter map
 * or the chapter-select hub. Reading is tracked in `save.coursesRead` so the
 * auto-open only happens once per chapter; reaching the end marks it read.
 *
 * Content is authored as `content/<chapter>/course.md` and split into pages at
 * each `##` section heading, so a long course reads as a sequence of digestible
 * pages rather than one giant scroll. Rendered full-width with the shared
 * markdown renderer (headings, lists, fenced code, blockquotes, tables, links).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import SageAvatar from "../components/SageAvatar";
import { renderMarkdown } from "../components/markdown";
import { useGameStore, selectChapter } from "../game/store";
import { getCourse } from "../game/content-loader";
import { personalize } from "../game/personalize";
import type { ChapterId } from "../ipc/contract";

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

/**
 * Split a course into pages at each top-level `## ` section heading. The
 * leading title + intro (everything before the first `##`) is page one; every
 * `##` section after that starts a new page. Fence-aware: `#`/`##` lines inside
 * fenced code blocks (bash comments, output) never trigger a page break.
 */
function paginateCourse(md: string): string[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const pages: string[] = [];
  let cur: string[] = [];
  let inFence = false;
  const hasContent = (ls: string[]) => ls.some((l) => l.trim() !== "");
  for (const line of lines) {
    if (/^```/.test(line)) inFence = !inFence;
    if (!inFence && /^##\s/.test(line) && hasContent(cur)) {
      pages.push(cur.join("\n").trim());
      cur = [];
    }
    cur.push(line);
  }
  if (hasContent(cur)) pages.push(cur.join("\n").trim());
  return pages.length ? pages : [md];
}

export interface CourseSceneProps {
  chapter: ChapterId;
}

export default function CourseScene({ chapter }: CourseSceneProps) {
  const summary = useGameStore(selectChapter(chapter));
  const goTo = useGameStore((s) => s.goTo);
  const markCourseRead = useGameStore((s) => s.markCourseRead);
  const profile = useGameStore((s) => s.save?.profile ?? null);
  const alreadyRead = useGameStore(
    (s) => s.save?.coursesRead.includes(chapter) ?? false,
  );

  const course = useMemo(() => getCourse(chapter), [chapter]);
  const pages = useMemo(
    () => (course ? paginateCourse(course) : []),
    [course],
  );

  const [page, setPage] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Reset to the first page when the chapter changes, and scroll the body back
  // to the top whenever the page changes.
  useEffect(() => setPage(0), [chapter]);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [page]);

  const title = summary?.title ?? CHAPTER_TITLE_FALLBACKS[chapter] ?? chapter;
  const ordinal = ORDINALS[chapter] ?? chapter.toUpperCase();
  const total = pages.length;
  const onLast = page >= total - 1;

  const finish = async () => {
    await markCourseRead(chapter);
    goTo({ kind: "chapter-map", chapter });
  };

  return (
    <main className="flex h-full w-full flex-col">
      {/* Header */}
      <header className="flex items-center gap-4 border-b border-cosmos-border px-8 py-5">
        <SageAvatar size="lg" />
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-phosphor-400">
            {ordinal} · Theory
          </p>
          <h1 className="cosmos-glow truncate text-3xl font-semibold text-cosmos-text">
            {title}
          </h1>
        </div>
      </header>

      {/* Scrollable course body - one page at a time, full width */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto px-8 py-6 lg:px-12">
        {course ? (
          <article className="course-prose space-y-4 text-cosmos-text">
            {renderMarkdown(personalize(pages[page] ?? course, profile))}
          </article>
        ) : (
          <div className="rounded-lg border border-dashed border-cosmos-border bg-cosmos-panel/60 p-8 text-center text-sm text-cosmos-muted">
            The theory for this chapter hasn't been written yet. Head into the
            missions - Sage will walk you through it hands-on.
          </div>
        )}
      </div>

      {/* Footer - page navigation */}
      <footer className="flex items-center justify-between gap-3 border-t border-cosmos-border px-8 py-4">
        <button
          type="button"
          onClick={() => goTo({ kind: "chapter-map", chapter })}
          className="rounded px-2 py-1 text-xs text-cosmos-muted hover:text-phosphor-400"
        >
          ← Map
        </button>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded px-3 py-1.5 text-sm text-cosmos-muted transition-colors hover:text-phosphor-400 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ← Prev
          </button>

          {total > 1 && (
            <span className="font-mono text-xs tabular-nums text-cosmos-muted">
              {page + 1} / {total}
            </span>
          )}

          {onLast ? (
            <button
              type="button"
              onClick={() => void finish()}
              className={
                "rounded-md border border-phosphor-600/50 bg-phosphor-500/10 px-4 py-1.5 " +
                "text-sm font-medium text-phosphor-200 transition-colors hover:bg-phosphor-500/20"
              }
            >
              {alreadyRead ? "Back to map" : "Continue to missions →"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(total - 1, p + 1))}
              className={
                "rounded-md border border-phosphor-600/50 bg-phosphor-500/10 px-4 py-1.5 " +
                "text-sm font-medium text-phosphor-200 transition-colors hover:bg-phosphor-500/20"
              }
            >
              Next →
            </button>
          )}
        </div>
      </footer>
    </main>
  );
}
