/**
 * ObjectivePanel - sidebar that shows the mission's objectives with their
 * completion state. Objectives that flip from incomplete → complete play
 * a small "tick pop" animation and update the aria-live region.
 */

import { useEffect, useRef, useState } from "react";
import type { Objective } from "../ipc/contract";

export interface ObjectivePanelProps {
  title?: string;
  objectives: Objective[];
  /** Optional id of the objective the player is currently focused on. */
  activeObjectiveId?: string;
  className?: string;
}

export default function ObjectivePanel({
  title = "Objectives",
  objectives,
  activeObjectiveId,
  className,
}: ObjectivePanelProps) {
  // Track which objectives just completed so we can play the pop animation.
  const prevDoneRef = useRef<Record<string, boolean>>({});
  const [poppedIds, setPoppedIds] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState<string>("");

  useEffect(() => {
    const newlyDone: string[] = [];
    objectives.forEach((o) => {
      const wasDone = prevDoneRef.current[o.id] ?? false;
      if (o.completed && !wasDone) newlyDone.push(o.id);
      prevDoneRef.current[o.id] = o.completed;
    });
    if (newlyDone.length > 0) {
      setPoppedIds((prev) => {
        const next = new Set(prev);
        newlyDone.forEach((id) => next.add(id));
        return next;
      });
      const labels = newlyDone
        .map((id) => objectives.find((o) => o.id === id)?.label ?? id)
        .join(", ");
      setAnnouncement(`Objective complete: ${labels}`);
      const t = window.setTimeout(() => {
        setPoppedIds((prev) => {
          const next = new Set(prev);
          newlyDone.forEach((id) => next.delete(id));
          return next;
        });
      }, 500);
      return () => window.clearTimeout(t);
    }
  }, [objectives]);

  const total = objectives.length;
  const done = objectives.filter((o) => o.completed).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <aside
      aria-label={title}
      className={
        "flex h-full flex-col rounded-lg border border-cosmos-border " +
        "bg-cosmos-panel/80 p-4 backdrop-blur-sm " +
        (className ?? "")
      }
    >
      <header className="mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-phosphor-400">
          {title}
        </h2>
        <div className="mt-1 flex items-center gap-2 text-xs text-cosmos-muted">
          <div
            className="h-1 flex-1 overflow-hidden rounded-full bg-cosmos-panel-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            aria-valuetext={`${done} of ${total} objectives complete`}
          >
            <div
              className="h-full bg-phosphor-500 transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono tabular-nums">
            {done}/{total}
          </span>
        </div>
      </header>

      <ol className="flex-1 space-y-2 overflow-y-auto pr-1">
        {objectives.map((o) => {
          const isPopped = poppedIds.has(o.id);
          const isActive = activeObjectiveId === o.id;
          return (
            <li
              key={o.id}
              aria-current={isActive ? "step" : undefined}
              className={
                "flex items-start gap-3 rounded-md border px-3 py-2 transition-colors " +
                (o.completed
                  ? "border-phosphor-600/50 bg-phosphor-500/5 "
                  : "border-cosmos-border bg-cosmos-panel-2/40 ") +
                (isActive
                  ? "ring-1 ring-phosphor-400/40 "
                  : "")
              }
            >
              <span
                aria-hidden="true"
                className={
                  "mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-bold " +
                  (o.completed
                    ? "bg-phosphor-500 text-cosmos-bg "
                    : "border border-cosmos-border text-cosmos-muted ") +
                  (isPopped ? "cosmos-tick-pop " : "")
                }
              >
                {o.completed ? "✓" : "○"}
              </span>
              <span
                className={
                  "text-sm " +
                  (o.completed
                    ? "text-cosmos-muted line-through"
                    : "text-cosmos-text")
                }
              >
                {o.label}
              </span>
            </li>
          );
        })}
      </ol>

      <p
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </p>
    </aside>
  );
}
