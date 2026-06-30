/**
 * DialogueBox - renders Markdown dialogue from a mentor character ("Sage")
 * with a typewriter effect, advancing on click / Enter / Space.
 *
 * Long dialogue is split on blank lines into "beats." Each beat types in
 * character-by-character; the user advances to the next beat with the
 * "next" arrow (or Enter). Pressing Enter while a beat is still typing
 * skips to the end of that beat.
 *
 * Respects prefers-reduced-motion: in that mode beats render instantly and
 * the typewriter is disabled.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { renderMarkdown, stripMarkdown } from "./markdown";
import SageAvatar from "./SageAvatar";
import { useGameStore } from "../game/store";
import { personalize } from "../game/personalize";

export interface DialogueBoxProps {
  /** Speaker name shown above the dialogue (e.g. "Sage"). */
  speaker?: string;
  /** Markdown source. Beats are split by blank lines. */
  source: string;
  /** Called once the user has advanced past the final beat. */
  onComplete?: () => void;
  /** Optional className passed to the outer wrapper. */
  className?: string;
  /** ms per character (default ~25). 0 disables the typewriter. */
  charDelayMs?: number;
}

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function DialogueBox({
  speaker = "Sage",
  source,
  onComplete,
  className,
  charDelayMs = 22,
}: DialogueBoxProps) {
  // Substitute player-profile tokens (e.g. {firstName}) before splitting into
  // beats, so Sage can address the player by name in authored content.
  const profile = useGameStore((s) => s.save?.profile ?? null);
  const beats = useMemo(
    () =>
      personalize(source, profile)
        .replace(/\r\n/g, "\n")
        .split(/\n\s*\n/)
        .map((b) => b.trim())
        .filter(Boolean),
    [source, profile],
  );

  const [beatIdx, setBeatIdx] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const intervalRef = useRef<number | null>(null);

  const currentBeat = beats[beatIdx] ?? "";
  const plain = useMemo(() => stripMarkdown(currentBeat), [currentBeat]);
  const isLastBeat = beatIdx >= beats.length - 1;
  const isTyping = revealed < plain.length && !REDUCED_MOTION;

  // Reset reveal whenever the beat or source changes.
  useEffect(() => {
    setRevealed(REDUCED_MOTION || charDelayMs === 0 ? plain.length : 0);
  }, [beatIdx, plain.length, charDelayMs]);

  // Typewriter tick.
  useEffect(() => {
    if (!isTyping || charDelayMs === 0) return;
    intervalRef.current = window.setInterval(() => {
      setRevealed((r) => {
        if (r >= plain.length) {
          if (intervalRef.current) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return r;
        }
        return r + 1;
      });
    }, charDelayMs);
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isTyping, charDelayMs, plain.length]);

  const advance = useCallback(() => {
    if (isTyping) {
      setRevealed(plain.length); // skip to end of beat
      return;
    }
    if (isLastBeat) {
      onComplete?.();
      return;
    }
    setBeatIdx((i) => i + 1);
  }, [isTyping, isLastBeat, plain.length, onComplete]);

  // Keyboard advance: Enter or Space.
  const onKeyDown = useCallback(
    (ev: React.KeyboardEvent<HTMLDivElement>) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        advance();
      }
    },
    [advance],
  );

  // For typewriter: render "currentBeat" but only the first N plain-text
  // characters. We approximate this by truncating the source on the same
  // boundary (the markdown chars are not counted, which keeps formatting
  // intact). This keeps the parser simple at the cost of slightly faster
  // perceived typing through bold/italic markers.
  const visibleSource = useMemo(() => {
    if (revealed >= plain.length) return currentBeat;
    let plainSeen = 0;
    let out = "";
    let i = 0;
    while (i < currentBeat.length && plainSeen < revealed) {
      const ch = currentBeat[i];
      // Skip markdown control chars without counting them.
      if (
        ch === "*" ||
        ch === "`" ||
        ch === "[" ||
        ch === "]" ||
        ch === "(" ||
        ch === ")" ||
        ch === "#"
      ) {
        out += ch;
        i++;
        continue;
      }
      out += ch;
      plainSeen++;
      i++;
    }
    return out;
  }, [revealed, plain.length, currentBeat]);

  return (
    <div
      role="dialog"
      aria-label={`${speaker} dialogue`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={advance}
      className={
        "relative cursor-pointer rounded-lg border border-cosmos-border " +
        "bg-cosmos-panel/90 p-5 shadow-lg backdrop-blur-sm " +
        "select-none " +
        (className ?? "")
      }
    >
      <header className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-phosphor-400">
        {speaker === "Sage" ? (
          <SageAvatar size="sm" />
        ) : (
          <span aria-hidden="true">◇</span>
        )}
        <span>{speaker}</span>
        <span className="ml-auto text-cosmos-muted">
          {beatIdx + 1} / {beats.length || 1}
        </span>
      </header>

      <div
        className={
          "prose-cosmos space-y-3 text-cosmos-text " +
          (isTyping ? "cosmos-caret" : "")
        }
      >
        {renderMarkdown(visibleSource)}
      </div>

      <footer className="mt-4 flex items-center justify-end text-xs text-cosmos-muted">
        <span aria-live="polite">
          {isTyping
            ? "press Enter to skip"
            : isLastBeat
              ? "press Enter to continue"
              : "press Enter for more"}
        </span>
        <span
          aria-hidden="true"
          className={
            "ml-3 inline-block text-phosphor-400 " +
            (isTyping ? "" : "animate-pulse")
          }
        >
          ▶
        </span>
      </footer>
    </div>
  );
}
