/**
 * App - the top-level scene router.
 *
 * Boot order:
 *   1. On mount, call `useGameStore.init()`. That wires the engine to Tauri
 *      events, probes Docker, lists bundled content, and hydrates the save.
 *   2. Render the scene matching `scene.kind`. Scenes drive transitions by
 *      calling `goTo(...)` from the store.
 *
 * Scene routing here is intentionally a thin switch - engine wiring lives in
 * `src/game/store.ts` and `src/game/engine.ts` (mission-engine's territory).
 */

import { useEffect } from "react";
import { useGameStore } from "./game/store";
import TitleScene from "./scenes/TitleScene";
import OnboardingScene from "./scenes/OnboardingScene";
import ChapterSelectScene from "./scenes/ChapterSelectScene";
import ChapterIntro from "./scenes/ChapterIntro";
import CourseScene from "./scenes/CourseScene";
import ChapterMapScene from "./scenes/ChapterMapScene";
import MissionScene from "./scenes/MissionScene";
import DevTerminalScene from "./scenes/DevTerminalScene";

export default function App() {
  const init = useGameStore((s) => s.init);
  const ready = useGameStore((s) => s.ready);
  const scene = useGameStore((s) => s.scene);

  useEffect(() => {
    void init();
  }, [init]);

  if (!ready) {
    return (
      <main className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.4em] text-phosphor-400">
            Cosmos Corp
          </p>
          <p className="mt-2 text-cosmos-muted">
            <span className="cosmos-caret">booting</span>
          </p>
        </div>
      </main>
    );
  }

  switch (scene.kind) {
    case "title":
      return <TitleScene />;
    case "onboarding":
      return <OnboardingScene />;
    case "chapter-select":
      return <ChapterSelectScene />;
    case "chapter-intro":
      return <ChapterIntro chapter={scene.chapter} />;
    case "course":
      return <CourseScene chapter={scene.chapter} />;
    case "chapter-map":
      return <ChapterMapScene chapter={scene.chapter} />;
    case "mission":
      return <MissionScene missionKey={scene.key} />;
    case "chapter-complete":
      return <ChapterCompleteScene chapter={scene.chapter} />;
    case "dev-terminal":
      return <DevTerminalScene />;
    case "boot-error":
      return <BootErrorScene message={scene.message} />;
  }
}

// ─── Inline scenes used only by App ──────────────────────────────────────────

function ChapterCompleteScene({ chapter }: { chapter: string }) {
  const goTo = useGameStore((s) => s.goTo);
  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-6 p-8 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-phosphor-400">
        Chapter complete
      </p>
      <h1 className="cosmos-glow text-4xl font-semibold text-cosmos-text">
        {chapter} - wrapped.
      </h1>
      <p className="text-cosmos-muted">
        Take a stretch. The next chapter is waiting whenever you are.
      </p>
      <button
        type="button"
        onClick={() => goTo({ kind: "title" })}
        className="rounded-md border border-phosphor-600/50 bg-phosphor-500/10 px-4 py-2 text-sm font-medium text-phosphor-200 hover:bg-phosphor-500/20"
      >
        Back to title
      </button>
    </main>
  );
}

function BootErrorScene({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-6 p-8 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-danger">
        Boot error
      </p>
      <pre className="max-w-full overflow-x-auto rounded-md border border-danger/40 bg-cosmos-panel p-4 text-left font-mono text-xs text-danger">
        {message}
      </pre>
      <p className="text-cosmos-muted">
        The Rust backend isn't reachable. Check the dev console for details.
      </p>
    </main>
  );
}
