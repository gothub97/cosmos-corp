/**
 * LessonCard - focused teaching overlay shown before an objective unlocks.
 *
 * Sage explains *what* the command does and shows a worked example, so a
 * beginner doesn't have to infer the answer from progressive hints. The card
 * is modal: focus moves into it on mount, Escape does NOT dismiss (the lesson
 * is the point - the player has to acknowledge with "Got it").
 *
 * Accessibility:
 *   - role="dialog", aria-modal, aria-labelledby points at the command title
 *   - autoFocus on the primary button
 *   - keyboard trap-lite: Tab cycles within the card (single button so trivial)
 *   - Enter / Space on the button (default) confirm
 *   - Esc is intentionally swallowed
 *   - prefers-reduced-motion respected (no entrance animation)
 *
 * Visuals match the Cosmos Corp design language (CRT-ish dark, phosphor green
 * accent, monospace for tech bits, sans-serif for narrative).
 */

import { useEffect, useRef } from "react";
import type { Lesson, LessonExample } from "../ipc/contract";
import SageAvatar from "./SageAvatar";

export interface LessonCardProps {
  lesson: Lesson;
  /**
   * Called when the player clicks "Got it →". The parent is expected to
   * persist via `engine.markCommandTaught(lesson.command)` and clear the
   * overlay.
   */
  onAcknowledge: () => void;
  /** Optional speaker name override. Defaults to "Sage". */
  speaker?: string;
  className?: string;
}

export default function LessonCard({
  lesson,
  onAcknowledge,
  speaker = "Sage",
  className,
}: LessonCardProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Focus the primary action on mount so screen readers and keyboard users
  // land in the right place. autoFocus on the JSX would also work, but doing
  // it imperatively is more reliable in StrictMode.
  useEffect(() => {
    const id = window.setTimeout(() => buttonRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, []);

  // Keyboard guard:
  //   - Esc: swallowed (lesson must be acknowledged).
  //   - Tab: kept within the card (we only have one focusable element, so
  //     wrap is "stay on the button").
  const onKeyDown = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      // Re-anchor focus in case the user managed to escape it.
      buttonRef.current?.focus();
      return;
    }
    if (ev.key === "Tab") {
      ev.preventDefault();
      buttonRef.current?.focus();
    }
  };

  const titleId = `lesson-${lesson.command.replace(/[^a-z0-9]/gi, "_")}-title`;

  return (
    <div
      role="presentation"
      className={
        "absolute inset-0 z-30 flex items-center justify-center " +
        "bg-cosmos-bg/85 backdrop-blur-md " +
        (className ?? "")
      }
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className={
          "w-[min(640px,calc(100%-2rem))] rounded-xl border border-phosphor-600/40 " +
          "bg-cosmos-panel p-6 shadow-2xl shadow-phosphor-500/10 " +
          "motion-safe:animate-[cosmos-tick-pop_220ms_ease-out]"
        }
      >
        {/* Speaker header */}
        <header className="mb-4 flex items-center gap-3">
          {speaker === "Sage" ? (
            <SageAvatar size="md" />
          ) : (
            <span
              aria-hidden="true"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-phosphor-600/60 bg-phosphor-500/10 text-lg text-phosphor-200"
            >
              ◇
            </span>
          )}
          <div>
            <p className="text-xs uppercase tracking-widest text-phosphor-400">
              {speaker} teaches
            </p>
            <p className="text-xs text-cosmos-muted">
              new command - once you've got it, future missions skip ahead
            </p>
          </div>
        </header>

        {/* Command title */}
        <h2
          id={titleId}
          className="cosmos-glow font-mono text-3xl font-semibold text-phosphor-200"
        >
          {lesson.command}
        </h2>

        {/* Summary */}
        <p className="mt-2 leading-relaxed text-cosmos-text">
          {lesson.summary}
        </p>

        {/* Optional syntax line */}
        {lesson.syntax && (
          <p className="mt-3 font-mono text-sm text-cosmos-muted">
            <span className="mr-2 uppercase tracking-widest text-phosphor-400">
              syntax
            </span>
            {lesson.syntax}
          </p>
        )}

        {/* Examples */}
        <section
          aria-label="Worked examples"
          className="mt-5 space-y-3 rounded-lg border border-cosmos-border bg-cosmos-bg/50 p-3"
        >
          <p className="text-xs uppercase tracking-widest text-phosphor-400">
            Try it
          </p>
          {lesson.examples.map((ex, i) => (
            <ExampleBlock key={i} example={ex} />
          ))}
        </section>

        {/* Primary action */}
        <footer className="mt-6 flex items-center justify-between gap-3">
          <p className="text-xs text-cosmos-muted">
            Take a beat - when it makes sense, continue.
          </p>
          <button
            ref={buttonRef}
            type="button"
            onClick={onAcknowledge}
            className={
              "inline-flex items-center gap-2 rounded-md border border-phosphor-600/60 " +
              "bg-phosphor-500/15 px-5 py-2 text-base font-medium text-phosphor-200 " +
              "transition-colors hover:bg-phosphor-500/25 " +
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-phosphor-400"
            }
          >
            Got it
            <span aria-hidden="true">→</span>
          </button>
        </footer>
      </div>
    </div>
  );
}

// ─── Example block ───────────────────────────────────────────────────────────

interface ExampleBlockProps {
  example: LessonExample;
}

function ExampleBlock({ example }: ExampleBlockProps) {
  const inputLines = example.input.split("\n");
  const outputLines = example.output?.split("\n") ?? [];
  return (
    <div className="rounded-md border border-cosmos-border/70 bg-cosmos-panel/60">
      {/* Input - every line gets the `$ ` prompt prefix. */}
      <pre className="overflow-x-auto px-3 py-2 font-mono text-sm text-cosmos-text">
        {inputLines.map((line, i) => (
          <div key={i} className="flex">
            <span
              aria-hidden="true"
              className="mr-2 select-none text-phosphor-400"
            >
              $
            </span>
            <span>{line}</span>
          </div>
        ))}
      </pre>

      {/* Visual divider only when there's output to show. */}
      {outputLines.length > 0 && (
        <>
          <hr className="border-cosmos-border/70" />
          <pre className="overflow-x-auto px-3 py-2 font-mono text-sm text-cosmos-muted">
            {outputLines.map((line, i) => (
              <div key={i}>{line || " "}</div>
            ))}
          </pre>
        </>
      )}

      {/* Optional one-liner explaining why this example matters. */}
      {example.note && (
        <p className="border-t border-cosmos-border/70 bg-cosmos-bg/40 px-3 py-2 text-xs italic text-cosmos-muted">
          {example.note}
        </p>
      )}
    </div>
  );
}
