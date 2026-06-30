/**
 * HintButton - progressive hint reveal.
 *
 * The button is presentational: it renders previously-revealed hints, locked
 * tier placeholders (when `totalHints` is known), and a "Reveal next" button.
 * The actual `invoke("reveal_hint", ...)` call lives behind `onRequest` so
 * callers (typically the Zustand store) can cache, persist, and surface
 * errors consistently.
 */

import { useCallback, useState } from "react";

export interface HintButtonProps {
  objectiveId: string;
  /** Hint texts already revealed for this objective, in order. */
  revealed: string[];
  /** Optional total number of hints - drives the locked tier dots. */
  totalHints?: number;
  /** Disabled when objective is already complete. */
  disabled?: boolean;
  /**
   * Trigger the next reveal. The caller is responsible for persisting and
   * pushing the new text into `revealed`. Should reject on error.
   */
  onRequest: (objectiveId: string) => Promise<void>;
  className?: string;
}

export default function HintButton({
  objectiveId,
  revealed,
  totalHints,
  disabled,
  onRequest,
  className,
}: HintButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exhausted =
    typeof totalHints === "number" && revealed.length >= totalHints;

  const requestNext = useCallback(async () => {
    if (busy || disabled || exhausted) return;
    setBusy(true);
    setError(null);
    try {
      await onRequest(objectiveId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Could not reveal hint.");
    } finally {
      setBusy(false);
    }
  }, [busy, disabled, exhausted, objectiveId, onRequest]);

  const lockedSlots =
    typeof totalHints === "number"
      ? Math.max(0, totalHints - revealed.length)
      : 0;

  const buttonLabel =
    revealed.length === 0
      ? "Need a hint?"
      : exhausted
        ? "All hints revealed"
        : "Reveal next hint";

  return (
    <section
      aria-label="Hints"
      className={
        "rounded-lg border border-cosmos-border bg-cosmos-panel/80 p-3 " +
        (className ?? "")
      }
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-phosphor-400">
          Hints
        </h3>
        {typeof totalHints === "number" && (
          <span className="font-mono text-xs text-cosmos-muted tabular-nums">
            {revealed.length}/{totalHints}
          </span>
        )}
      </div>

      {revealed.length === 0 && !error && (
        <p className="text-xs italic text-cosmos-muted">
          Stuck? Sage's hints get more specific each tier. Try the terminal
          first - that's how the muscle memory sticks.
        </p>
      )}

      {revealed.length > 0 && (
        <ol className="mb-2 space-y-2">
          {revealed.map((text, idx) => (
            <li
              key={idx}
              className="rounded-md border border-cosmos-border/60 bg-cosmos-panel-2/40 p-2 text-sm text-cosmos-text"
            >
              <span className="mr-2 font-mono text-xs text-phosphor-400">
                #{idx + 1}
              </span>
              {text}
            </li>
          ))}
        </ol>
      )}

      {lockedSlots > 0 && (
        <ol className="mb-2 space-y-1" aria-hidden="true">
          {Array.from({ length: lockedSlots }).map((_, idx) => (
            <li
              key={idx}
              className="rounded-md border border-dashed border-cosmos-border/60 p-2 font-mono text-xs text-cosmos-muted/60 select-none"
            >
              ░░░░░░░░░░░░░░░
            </li>
          ))}
        </ol>
      )}

      {error && (
        <p
          role="alert"
          className="mb-2 rounded-md border border-danger/40 bg-danger/10 p-2 text-xs text-danger"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={requestNext}
        disabled={busy || disabled || exhausted}
        aria-disabled={busy || disabled || exhausted}
        className={
          "inline-flex w-full items-center justify-center gap-2 rounded-md border border-phosphor-600/40 " +
          "bg-phosphor-500/10 px-3 py-2 text-sm font-medium text-phosphor-200 " +
          "transition-colors hover:bg-phosphor-500/20 " +
          "disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {busy ? "Asking Sage…" : buttonLabel}
      </button>
    </section>
  );
}
