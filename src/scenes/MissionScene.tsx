/**
 * MissionScene - composes Terminal + DialogueBox + ObjectivePanel + HintButton
 * into the actual play surface.
 *
 * Layout (desktop):
 *
 *   ┌──────────────────────┬────────────────┐
 *   │  Terminal            │ Objectives     │
 *   │  (LessonCard         ├────────────────┤
 *   │   overlay when       │ Hints          │
 *   │   gating an obj.)    │                │
 *   ├──────────────────────┴────────────────┤
 *   │   DialogueBox (intro / outro)         │
 *   └───────────────────────────────────────┘
 *
 * The dialogue panel is collapsed once the intro is dismissed and re-opens
 * automatically when the mission flips to the `completing` state (outro).
 *
 * Lesson gate: the next-incomplete objective's lesson card is rendered as a
 * focused overlay over the terminal area when (a) the objective has a lesson,
 * (b) its `lesson.command` is NOT in `mission.taughtCommands`, and (c) it
 * hasn't been acknowledged yet this session (`lessonShownFor`). The terminal
 * stays mounted underneath so PTY state persists; the overlay just visually
 * obscures it and traps focus.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Terminal, { type TerminalHandle } from "../components/Terminal";
import DialogueBox from "../components/DialogueBox";
import ObjectivePanel from "../components/ObjectivePanel";
import HintButton from "../components/HintButton";
import LessonCard from "../components/LessonCard";
import ClusterView from "../components/ClusterView";
import InspectPanel from "../components/InspectPanel";
import {
  useGameStore,
  selectMission,
  selectIsLoading,
  selectIsCompleting,
} from "../game/store";
import {
  parseMissionKey,
  type K8sResource,
  type MissionKey,
  type Objective,
} from "../ipc/contract";

export interface MissionSceneProps {
  missionKey: MissionKey;
}

type Phase = "intro" | "playing" | "outro";

export default function MissionScene({ missionKey }: MissionSceneProps) {
  const mission = useGameStore(selectMission);
  const isLoading = useGameStore(selectIsLoading);
  const isCompleting = useGameStore(selectIsCompleting);
  const hintsByObjective = useGameStore((s) => s.hintsByObjective);
  const lessonShownFor = useGameStore((s) => s.lessonShownFor);
  const currentObjectiveIndex = useGameStore((s) => s.currentObjectiveIndex);
  const lastError = useGameStore((s) => s.lastError);
  const clearError = useGameStore((s) => s.clearError);
  const revealHint = useGameStore((s) => s.revealHint);
  const acknowledgeLesson = useGameStore((s) => s.acknowledgeLesson);
  const goTo = useGameStore((s) => s.goTo);

  const [phase, setPhase] = useState<Phase>("intro");
  const terminalRef = useRef<TerminalHandle>(null);

  // Flip to outro automatically when the engine signals 'completing'.
  useEffect(() => {
    if (isCompleting && phase !== "outro") setPhase("outro");
  }, [isCompleting, phase]);

  // ── Lesson gate ─────────────────────────────────────────────────────────
  // Render LessonCard when the next-incomplete objective has a lesson AND
  // (a) the canonical command isn't in mission.taughtCommands AND (b) the
  // player hasn't acknowledged it this session. If a lesson exists but the
  // command is already taught, no overlay - the terminal is reachable
  // immediately.
  const activeObjective: Objective | undefined = useMemo(
    () =>
      mission && currentObjectiveIndex >= 0
        ? mission.objectives[currentObjectiveIndex]
        : undefined,
    [mission, currentObjectiveIndex],
  );
  const activeObjectiveId = activeObjective?.id;

  const lessonGating = useMemo(() => {
    if (!mission || !activeObjective) return null;
    const lesson = activeObjective.lesson;
    if (!lesson) return null;
    if (mission.taughtCommands.includes(lesson.command)) return null;
    if (lessonShownFor.has(activeObjective.id)) return null;
    return { objective: activeObjective, lesson };
  }, [mission, activeObjective, lessonShownFor]);

  // The lesson overlay only renders while the player is in the play phase -
  // during intro the DialogueBox owns attention; during outro the mission is
  // already complete so there's nothing to gate.
  const showLessonCard = phase === "playing" && !!lessonGating;

  // Focus the terminal once intro is dismissed AND no lesson is gating it.
  useEffect(() => {
    if (phase === "playing" && !showLessonCard) {
      const id = window.setTimeout(() => terminalRef.current?.focus(), 50);
      return () => window.clearTimeout(id);
    }
  }, [phase, showLessonCard]);

  const chapterId = parseMissionKey(missionKey).chapter;

  // ── Cluster-viz layout state ───────────────────────────────────────────────
  // When the mission has `clusterView`, the main column splits vertically:
  // ClusterView on top, Terminal docked at bottom with a draggable handle.
  const hasClusterView = !!mission?.clusterView;
  const [inspectTarget, setInspectTarget] = useState<K8sResource | null>(null);
  const onInspect = useCallback((r: K8sResource) => setInspectTarget(r), []);
  const onCloseInspect = useCallback(() => setInspectTarget(null), []);
  // Reset the inspect panel whenever the active mission changes.
  useEffect(() => {
    setInspectTarget(null);
  }, [missionKey]);

  if (isLoading || !mission) {
    return (
      <main className="flex min-h-full items-center justify-center p-8 text-cosmos-muted">
        <div className="flex flex-col items-center gap-3">
          <span className="cosmos-caret font-mono text-phosphor-400">
            spinning up sandbox
          </span>
          <p className="text-xs">{missionKey}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-full flex-col gap-3 p-3">
      <header className="flex items-center justify-between rounded-lg border border-cosmos-border bg-cosmos-panel/70 px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => goTo({ kind: "chapter-map", chapter: chapterId })}
            className="rounded px-2 py-1 text-xs text-cosmos-muted hover:text-phosphor-400"
          >
            ← Map
          </button>
          <span className="font-mono text-xs uppercase tracking-widest text-phosphor-400">
            {mission.key}
          </span>
          <h1 className="text-base font-semibold text-cosmos-text">
            {mission.title}
          </h1>
        </div>
        <span className="text-xs text-cosmos-muted">
          image: <span className="font-mono">{mission.containerImage}</span>
        </span>
      </header>

      {lastError && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          <span>{lastError}</span>
          <button
            type="button"
            onClick={clearError}
            className="ml-3 rounded px-2 py-0.5 text-xs hover:bg-danger/20"
          >
            dismiss
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* The main column. For Chapter 1/2 (no clusterView) it's just the
            Terminal. For Chapter 3+ it splits vertically: ClusterView on top,
            Terminal docked at the bottom with a draggable resize handle.
            Either way, the lesson overlay sits as a single `absolute inset-0`
            child so it covers the *entire* main column when active. */}
        <section
          className="relative min-h-[300px] min-w-0"
          aria-hidden={showLessonCard ? "true" : undefined}
        >
          {hasClusterView && mission ? (
            <ClusterTerminalSplit
              terminalRef={terminalRef}
              clusterSpec={mission.clusterView}
              onInspect={onInspect}
              onTerminalReady={() => terminalRef.current?.fit()}
            />
          ) : (
            <Terminal
              className="h-full"
              onReady={() => terminalRef.current?.fit()}
              ref={terminalRef}
            />
          )}
          {hasClusterView && (
            <InspectPanel resource={inspectTarget} onClose={onCloseInspect} />
          )}
          {showLessonCard && lessonGating && (
            <LessonCard
              lesson={lessonGating.lesson}
              onAcknowledge={() =>
                void acknowledgeLesson(
                  lessonGating.objective.id,
                  lessonGating.lesson.command,
                )
              }
            />
          )}
        </section>

        <aside className="flex flex-col gap-3 min-h-0">
          <ObjectivePanel
            objectives={mission.objectives}
            activeObjectiveId={activeObjectiveId}
            className="flex-1 min-h-0"
          />
          {activeObjectiveId && (
            <HintButton
              objectiveId={activeObjectiveId}
              revealed={hintsByObjective[activeObjectiveId] ?? []}
              disabled={
                mission.objectives.find((o) => o.id === activeObjectiveId)
                  ?.completed
              }
              onRequest={revealHint}
            />
          )}
        </aside>
      </div>

      {phase === "intro" && mission.introDialogue && (
        <DialogueBox
          speaker="Sage"
          source={mission.introDialogue}
          onComplete={() => setPhase("playing")}
        />
      )}

      {phase === "outro" && (
        <DialogueBox
          speaker="Sage"
          source={
            mission.outroDialogue ||
            `## Mission complete\n\nNice work. Take a breath, then we'll move on.`
          }
          onComplete={() => goTo({ kind: "chapter-map", chapter: chapterId })}
        />
      )}

      {phase === "playing" && (
        <button
          type="button"
          onClick={() => goTo({ kind: "chapter-map", chapter: chapterId })}
          className="mx-auto mt-1 rounded px-3 py-1 text-xs text-cosmos-muted hover:text-phosphor-400"
        >
          (esc - back to map)
        </button>
      )}
    </main>
  );
}

// ─── Cluster / Terminal vertical split ─────────────────────────────────────
//
// Used when `mission.clusterView` is present. Top pane = ClusterView, bottom
// pane = Terminal. The handle in between is draggable to resize. Terminal pane
// height is clamped to [120px, parentHeight - 160px] so neither pane collapses.

interface ClusterTerminalSplitProps {
  terminalRef: React.RefObject<TerminalHandle | null>;
  clusterSpec: import("../ipc/contract").ClusterViewSpec | undefined;
  onInspect: (r: K8sResource) => void;
  onTerminalReady: () => void;
}

function ClusterTerminalSplit({
  terminalRef,
  clusterSpec,
  onInspect,
  onTerminalReady,
}: ClusterTerminalSplitProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // Default: terminal takes ~30% of the wrapper height. Stored as a px value
  // so the layout doesn't reflow on parent resize unexpectedly; recomputed on
  // mount + window resize via ResizeObserver.
  const [terminalPx, setTerminalPx] = useState<number>(240);
  const draggingRef = useRef<{ startY: number; startPx: number } | null>(null);

  // Initial size: 30% of the wrapper, clamped.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const setFromHeight = () => {
      const h = el.clientHeight;
      const target = Math.round(h * 0.3);
      setTerminalPx((prev) => clampSplit(prev || target, h));
    };
    setFromHeight();
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight;
      setTerminalPx((prev) => clampSplit(prev, h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onPointerDown = useCallback((ev: React.PointerEvent<HTMLDivElement>) => {
    ev.preventDefault();
    (ev.currentTarget as HTMLDivElement).setPointerCapture(ev.pointerId);
    draggingRef.current = { startY: ev.clientY, startPx: terminalPx };
  }, [terminalPx]);

  const onPointerMove = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const wrap = wrapperRef.current;
      if (!wrap) return;
      const delta = ev.clientY - draggingRef.current.startY;
      // Dragging down (positive delta) → terminal shrinks (less px).
      // Dragging up (negative delta) → terminal grows (more px).
      const next = draggingRef.current.startPx - delta;
      setTerminalPx(clampSplit(next, wrap.clientHeight));
    },
    [],
  );

  const onPointerUp = useCallback((ev: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = null;
    try {
      (ev.currentTarget as HTMLDivElement).releasePointerCapture(ev.pointerId);
    } catch {
      /* released already */
    }
    // Refit the terminal once dragging settles so xterm matches the new size.
    window.setTimeout(() => terminalRef.current?.fit(), 0);
  }, [terminalRef]);

  // Keyboard accessibility on the handle.
  const onHandleKey = useCallback(
    (ev: React.KeyboardEvent<HTMLDivElement>) => {
      const wrap = wrapperRef.current;
      if (!wrap) return;
      const step = ev.shiftKey ? 40 : 16;
      if (ev.key === "ArrowUp") {
        ev.preventDefault();
        setTerminalPx((p) => clampSplit(p + step, wrap.clientHeight));
      } else if (ev.key === "ArrowDown") {
        ev.preventDefault();
        setTerminalPx((p) => clampSplit(p - step, wrap.clientHeight));
      }
      window.setTimeout(() => terminalRef.current?.fit(), 0);
    },
    [terminalRef],
  );

  return (
    <div
      ref={wrapperRef}
      className="flex h-full w-full flex-col"
    >
      <div className="min-h-0 flex-1">
        <ClusterView spec={clusterSpec} onInspect={onInspect} />
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize terminal pane"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onHandleKey}
        className={
          "group flex h-2 cursor-row-resize items-center justify-center " +
          "bg-cosmos-border/40 hover:bg-phosphor-500/40 transition-colors " +
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-phosphor-400"
        }
      >
        <span
          aria-hidden="true"
          className="block h-0.5 w-12 rounded-full bg-cosmos-muted/60 group-hover:bg-phosphor-300"
        />
      </div>
      <div style={{ height: `${terminalPx}px` }} className="min-h-[120px]">
        <Terminal
          className="h-full"
          onReady={onTerminalReady}
          ref={terminalRef}
        />
      </div>
    </div>
  );
}

function clampSplit(px: number, parentHeight: number): number {
  // Reserve at least 160px for the cluster view and 120px for the terminal.
  const minTerminal = 120;
  const maxTerminal = Math.max(minTerminal, parentHeight - 160);
  if (Number.isNaN(px)) return minTerminal;
  return Math.max(minTerminal, Math.min(maxTerminal, Math.round(px)));
}

