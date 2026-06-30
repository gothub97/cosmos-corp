/**
 * OnboardingScene - the first-launch wizard.
 *
 * Shown once, the very first time the app boots with no profile yet (see the
 * gate in store.init). It introduces Cosmos Corp and Sage, runs a Docker
 * readiness check, captures the player's name + role, and hands them a
 * Cosmos Corp ID badge before dropping them on the (now personalized) title.
 *
 * Layout mirrors CourseScene: a fixed header, a scrollable body that swaps per
 * step, and a footer with Back / Next. Identity is persisted via the store's
 * `completeOnboarding` action.
 */

import { useMemo, useState } from "react";
import SageAvatar from "../components/SageAvatar";
import { renderMarkdown } from "../components/markdown";
import { useGameStore } from "../game/store";

const STEPS = ["Welcome", "How it works", "System check", "Your profile", "Your badge"];

const ROLES = ["Platform Intern", "Junior SRE", "Ops Apprentice", "DevOps Trainee"];

const WELCOME_MD = `Welcome aboard. I'm **Sage** - senior infrastructure engineer here, and the
person who gets to show you the ropes.

Cosmos Corp runs real systems for real people, and over the next few chapters
you'll learn the tools we live in every day: the **terminal**, then **git**,
then **Kubernetes**, and finally **GitOps** with Flux.

We build the muscle memory together, one command at a time. No memorising, no
pretending it's easy when it isn't. Let's go.`;

const HOW_MD = `Here's how this works, so nothing catches you off guard:

- Each chapter is a set of **missions**. A mission gives you a real, sandboxed
  Linux container and a goal - you do the actual work, I check it for real.
- Stuck on a step? Hit the **hint** button. I'll nudge you, then nudge harder,
  then just tell you. No shame in it.
- Every chapter opens with a short **theory course** you can re-read any time.
- The sandboxes are disposable. You cannot break anything that matters, so
  poke at things. That's how this sticks.`;

/** Build a short, stable-ish Cosmos Corp employee id from the name plus a small
 *  random suffix, e.g. "CC-7F3A2". Pure cosmetic. */
function makeEmployeeId(firstName: string, lastName: string): string {
  const seed = `${firstName}${lastName}`.toLowerCase();
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const base = hash.toString(36).toUpperCase().slice(0, 3).padStart(3, "0");
  const suffix = Math.floor(Math.random() * 36 * 36)
    .toString(36)
    .toUpperCase()
    .padStart(2, "0");
  return `CC-${base}${suffix}`;
}

const inputClass =
  "w-full rounded-md border border-cosmos-border bg-cosmos-panel-2 px-3 py-2 " +
  "text-cosmos-text placeholder-cosmos-muted transition-colors " +
  "focus:border-phosphor-600/50 focus:outline-none focus:ring-2 focus:ring-phosphor-400/40";

const primaryBtn =
  "rounded-md border border-phosphor-600/50 bg-phosphor-500/10 px-4 py-2 " +
  "text-sm font-medium text-phosphor-200 transition-colors hover:bg-phosphor-500/20 " +
  "disabled:cursor-not-allowed disabled:opacity-40";

export default function OnboardingScene() {
  const dockerStatus = useGameStore((s) => s.dockerStatus);
  const probeDocker = useGameStore((s) => s.probeDocker);
  const completeOnboarding = useGameStore((s) => s.completeOnboarding);

  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState(ROLES[0]);
  const [rechecking, setRechecking] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [finishing, setFinishing] = useState(false);

  const dockerOk = dockerStatus?.state === "ready";
  const namesFilled = firstName.trim() !== "" && lastName.trim() !== "";
  const isLast = step === STEPS.length - 1;

  const startDate = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    [],
  );

  const onRecheck = async () => {
    setRechecking(true);
    await probeDocker();
    setRechecking(false);
  };

  const next = () => {
    // Profile step (3) is the gate; generate the badge id as we cross into it.
    if (step === 3) {
      setEmployeeId(makeEmployeeId(firstName, lastName));
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const finish = async () => {
    setFinishing(true);
    await completeOnboarding({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
      employeeId,
      onboardedAt: new Date().toISOString(),
    });
  };

  // Disable "Next" only when a step's own requirement isn't met.
  const nextDisabled = step === 3 && !namesFilled;

  return (
    <main className="flex h-full w-full flex-col">
      {/* Header */}
      <header className="flex items-center gap-4 border-b border-cosmos-border px-8 py-5">
        <SageAvatar size="lg" />
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-phosphor-400">
            Cosmos Corp · Onboarding
          </p>
          <h1 className="cosmos-glow truncate text-3xl font-semibold text-cosmos-text">
            {STEPS[step]}
          </h1>
        </div>
        <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-cosmos-muted">
          Step {step + 1} / {STEPS.length}
        </span>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-8 py-6 lg:px-12">
        <div className="mx-auto max-w-2xl">
          {step === 0 && (
            <article className="prose-cosmos space-y-4 text-cosmos-text">
              {renderMarkdown(WELCOME_MD)}
            </article>
          )}

          {step === 1 && (
            <article className="prose-cosmos space-y-4 text-cosmos-text">
              {renderMarkdown(HOW_MD)}
            </article>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <p className="text-cosmos-text">
                The missions run on Docker. Let's make sure it's up before you
                start - it saves a lot of head-scratching later.
              </p>
              <div className="flex items-center gap-3 rounded-lg border border-cosmos-border bg-cosmos-panel-2 px-4 py-3">
                <span
                  aria-hidden="true"
                  className={dockerOk ? "text-phosphor-400" : "text-amber-cursor"}
                >
                  {dockerOk ? "●" : "○"}
                </span>
                <div className="min-w-0">
                  <p
                    className={
                      "text-sm font-medium " +
                      (dockerOk ? "text-phosphor-400" : "text-amber-cursor")
                    }
                  >
                    Docker {dockerOk ? "ready" : "not detected"}
                  </p>
                  {dockerStatus?.state === "error" && dockerStatus.message && (
                    <p className="truncate text-xs text-cosmos-muted">
                      {dockerStatus.message}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void onRecheck()}
                  disabled={rechecking}
                  className="ml-auto shrink-0 rounded px-3 py-1.5 text-xs text-cosmos-muted transition-colors hover:text-phosphor-400 disabled:opacity-50"
                >
                  {rechecking ? "Checking…" : "Re-check"}
                </button>
              </div>
              {!dockerOk && (
                <p className="text-xs text-cosmos-muted">
                  No Docker yet? You can still continue and read along - just
                  start Docker Desktop before your first mission, then come back.
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <form
              className="space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (namesFilled) next();
              }}
            >
              <p className="text-cosmos-text">
                Let's get you in the system. What should I put on your badge?
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-phosphor-400">
                    First name
                  </span>
                  <input
                    type="text"
                    value={firstName}
                    autoFocus
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-phosphor-400">
                    Last name
                  </span>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    className={inputClass}
                  />
                </label>
              </div>
              <div>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-phosphor-400">
                  Starting role
                </span>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map((r) => (
                    <button
                      type="button"
                      key={r}
                      onClick={() => setRole(r)}
                      className={
                        "rounded-full border px-3 py-1.5 text-sm transition-colors " +
                        (role === r
                          ? "border-phosphor-600/60 bg-phosphor-500/15 text-phosphor-200"
                          : "border-cosmos-border bg-cosmos-panel-2 text-cosmos-muted hover:border-phosphor-600/40 hover:text-cosmos-text")
                      }
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              {/* Submit handled by the footer Next button; this hidden submit
                  lets Enter advance the form. */}
              <button type="submit" className="hidden" aria-hidden="true" />
            </form>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <p className="text-cosmos-text">
                You're official. Here's your access card - welcome to the team,{" "}
                <span className="text-phosphor-200">{firstName.trim()}</span>.
              </p>
              <div className="mx-auto max-w-md overflow-hidden rounded-xl border border-phosphor-600/40 bg-cosmos-panel-2 shadow-lg">
                <div className="flex items-center justify-between border-b border-cosmos-border bg-phosphor-500/10 px-5 py-3">
                  <span className="font-mono text-xs uppercase tracking-[0.3em] text-phosphor-400">
                    Cosmos Corp
                  </span>
                  <span className="font-mono text-xs uppercase tracking-widest text-cosmos-muted">
                    Access Card
                  </span>
                </div>
                <div className="flex items-center gap-4 px-5 py-5">
                  <SageAvatar size="lg" className="shrink-0" />
                  <div className="min-w-0">
                    <p className="cosmos-glow truncate text-xl font-semibold text-cosmos-text">
                      {firstName.trim()} {lastName.trim()}
                    </p>
                    <p className="truncate text-sm text-phosphor-200">{role}</p>
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs text-cosmos-muted">
                      <dt className="uppercase tracking-widest">ID</dt>
                      <dd className="tabular-nums text-cosmos-text">{employeeId}</dd>
                      <dt className="uppercase tracking-widest">Start</dt>
                      <dd className="text-cosmos-text">{startDate}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-between gap-3 border-t border-cosmos-border px-8 py-4">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || finishing}
          className="rounded px-3 py-1.5 text-sm text-cosmos-muted transition-colors hover:text-phosphor-400 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ← Back
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={() => void finish()}
            disabled={finishing}
            className={primaryBtn}
          >
            {finishing ? "Entering…" : "Enter Cosmos Corp →"}
          </button>
        ) : (
          <button
            type="button"
            onClick={next}
            disabled={nextDisabled}
            className={primaryBtn}
          >
            Next →
          </button>
        )}
      </footer>
    </main>
  );
}
