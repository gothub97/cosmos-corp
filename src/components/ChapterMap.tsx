/**
 * ChapterMap - title + locked/unlocked nodes representing each mission in a
 * chapter. The player can click an unlocked node to jump to (or replay) it.
 */

import type { ChapterId, MissionKey } from "../ipc/contract";

export type MissionNodeStatus =
  | "completed"
  | "current"
  | "available"
  | "locked";

export interface MissionNode {
  key: MissionKey;
  title: string;
  status: MissionNodeStatus;
  /** Short summary shown as a tooltip. */
  summary?: string;
}

export interface ChapterMapProps {
  chapterId: ChapterId;
  chapterTitle: string;
  subtitle?: string;
  missions: MissionNode[];
  onSelect?: (key: MissionKey) => void;
  className?: string;
}

const STATUS_STYLES: Record<MissionNodeStatus, string> = {
  completed:
    "border-phosphor-600/60 bg-phosphor-500/10 text-phosphor-200 hover:bg-phosphor-500/20",
  current:
    "border-amber-cursor bg-amber-cursor/10 text-amber-cursor hover:bg-amber-cursor/20 ring-1 ring-amber-cursor/50",
  available:
    "border-cosmos-border bg-cosmos-panel-2/60 text-cosmos-text hover:bg-cosmos-panel-2",
  locked:
    "border-cosmos-border/60 bg-cosmos-panel/40 text-cosmos-muted cursor-not-allowed",
};

const STATUS_GLYPH: Record<MissionNodeStatus, string> = {
  completed: "✓",
  current: "▶",
  available: "○",
  locked: "🔒",
};

export default function ChapterMap({
  chapterId,
  chapterTitle,
  subtitle,
  missions,
  onSelect,
  className,
}: ChapterMapProps) {
  return (
    <section
      aria-label={`${chapterTitle} - mission map`}
      className={
        "flex flex-col rounded-lg border border-cosmos-border " +
        "bg-cosmos-panel/80 p-5 backdrop-blur-sm " +
        (className ?? "")
      }
    >
      <header className="mb-4">
        <p className="font-mono text-xs uppercase tracking-widest text-phosphor-400">
          {chapterId}
        </p>
        <h2 className="cosmos-glow text-2xl font-semibold text-cosmos-text">
          {chapterTitle}
        </h2>
        {subtitle && (
          <p className="mt-1 text-sm text-cosmos-muted">{subtitle}</p>
        )}
      </header>

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {missions.map((m, i) => {
          const isLocked = m.status === "locked";
          const cls = STATUS_STYLES[m.status];
          return (
            <li key={m.key} className="contents">
              <button
                type="button"
                disabled={isLocked}
                aria-disabled={isLocked}
                aria-current={m.status === "current" ? "step" : undefined}
                title={m.summary}
                onClick={() => !isLocked && onSelect?.(m.key)}
                className={
                  "group relative flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors " +
                  cls +
                  " disabled:opacity-60"
                }
              >
                <div className="flex w-full items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-cosmos-bg/60 text-sm"
                  >
                    {STATUS_GLYPH[m.status]}
                  </span>
                  <span className="font-mono text-xs text-cosmos-muted">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="ml-auto text-xs uppercase tracking-wider text-cosmos-muted">
                    {m.status}
                  </span>
                </div>
                <span className="text-base font-medium leading-snug">
                  {m.title}
                </span>
                {m.summary && (
                  <span className="text-xs text-cosmos-muted">
                    {m.summary}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
