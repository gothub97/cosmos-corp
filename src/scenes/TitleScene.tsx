/**
 * TitleScene - the entry point.
 *
 * Shows the game title, a Docker health pill, and the "New game / Continue"
 * options. A small "Dev: walking-skeleton terminal" affordance is exposed so
 * the M0 integration milestone (task #13) can be tested without authoring
 * a chapter - it drops directly into a raw xterm bound to the Rust PTY.
 */

import { useGameStore } from "../game/store";

const DOCKER_LABELS: Record<string, string> = {
  starting: "starting…",
  ready: "ready",
  error: "unavailable",
};

export default function TitleScene() {
  const { dockerStatus, save, newGame, continueGame, goTo } = useGameStore();
  const dockerKey = dockerStatus?.state ?? "starting";
  const dockerLabel = DOCKER_LABELS[dockerKey] ?? dockerKey;
  const dockerOk = dockerStatus?.state === "ready";
  const hasSave = !!save?.currentMission;
  const profile = save?.profile;
  const firstName = profile?.firstName.trim() ?? "";

  return (
    <main className="flex min-h-full flex-col items-center justify-center p-8">
      <div className="w-full max-w-xl text-center">
        <p className="font-mono text-xs uppercase tracking-[0.4em] text-phosphor-400">
          Cosmos Corp
        </p>
        <h1 className="cosmos-glow mt-2 text-5xl font-semibold text-cosmos-text sm:text-6xl">
          Day One
        </h1>
        {firstName ? (
          <p className="mt-3 text-cosmos-muted">
            Welcome back,{" "}
            <span className="text-phosphor-200">{firstName}</span>.
            <br />
            {profile?.role || "On the team"}
            {profile?.employeeId ? ` · ${profile.employeeId}` : ""}
          </p>
        ) : (
          <p className="mt-3 text-cosmos-muted">
            A new hire. A new terminal. A mentor named Sage.
            <br />
            Build the muscle memory, ship for real.
          </p>
        )}

        <div className="mt-10 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => void continueGame()}
            disabled={!hasSave}
            className={
              "w-full rounded-md border border-phosphor-600/50 bg-phosphor-500/10 px-4 py-3 " +
              "text-base font-medium text-phosphor-200 transition-colors " +
              "hover:bg-phosphor-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            }
          >
            {hasSave ? "Continue" : "Continue (no save yet)"}
          </button>

          <button
            type="button"
            onClick={() => void newGame()}
            className={
              "w-full rounded-md border border-cosmos-border bg-cosmos-panel-2 px-4 py-3 " +
              "text-base font-medium text-cosmos-text transition-colors " +
              "hover:border-phosphor-600/50 hover:bg-cosmos-panel-2/80"
            }
          >
            New game
          </button>

          <button
            type="button"
            onClick={() => goTo({ kind: "chapter-select" })}
            className={
              "w-full rounded-md border border-cosmos-border bg-cosmos-panel-2 px-4 py-3 " +
              "text-base font-medium text-cosmos-text transition-colors " +
              "hover:border-phosphor-600/50 hover:bg-cosmos-panel-2/80"
            }
          >
            Select chapter
          </button>

          <button
            type="button"
            onClick={() => goTo({ kind: "dev-terminal" })}
            className={
              "mt-4 w-full rounded-md border border-dashed border-cosmos-border " +
              "bg-transparent px-4 py-2 text-sm text-cosmos-muted " +
              "transition-colors hover:text-phosphor-400"
            }
            title="Walking-skeleton terminal - for M0 integration testing."
          >
            Dev: open raw terminal
          </button>
        </div>

        <dl className="mt-10 grid grid-cols-2 gap-3 text-left">
          <dt className="text-xs uppercase tracking-widest text-cosmos-muted">
            Docker
          </dt>
          <dd
            className={
              "text-sm font-medium " +
              (dockerOk ? "text-phosphor-400" : "text-amber-cursor")
            }
          >
            <span aria-hidden="true">{dockerOk ? "●" : "○"}</span>{" "}
            {dockerLabel}
            {dockerStatus?.state === "error" && dockerStatus.message && (
              <span className="ml-1 text-xs text-cosmos-muted">
                - {dockerStatus.message}
              </span>
            )}
          </dd>
          <dt className="text-xs uppercase tracking-widest text-cosmos-muted">
            Save
          </dt>
          <dd className="text-sm text-cosmos-text">
            {save
              ? `${save.completedMissions.length} mission(s) completed`
              : "fresh slate"}
          </dd>
        </dl>
      </div>
    </main>
  );
}
