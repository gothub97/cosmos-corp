/**
 * ChapterIntro - title card for a chapter. Shows the number, the name, and a
 * single short blurb from Sage before kicking the player into the chapter map.
 */

import { useMemo } from "react";
import DialogueBox from "../components/DialogueBox";
import { useGameStore, selectChapter } from "../game/store";
import type { ChapterId } from "../ipc/contract";

const CHAPTER_INTROS: Record<
  ChapterId,
  { ordinal: string; subtitle: string; sageLine: string }
> = {
  ch01: {
    ordinal: "Chapter One",
    subtitle: "The Terminal",
    sageLine:
      "Good to have you, {firstName}. Before we touch a cluster, before we touch a repo, we live in the *terminal*.\n\nDon't worry about memorising every flag - we'll build muscle memory together, one command at a time.",
  },
  ch02: {
    ordinal: "Chapter Two",
    subtitle: "The Codebase",
    sageLine:
      "Now that the shell feels familiar, let's give the team a way to collaborate without stepping on each other.\n\nGit isn't magic - it's a careful little notebook. We'll learn to read it.",
  },
  ch03: {
    ordinal: "Chapter Three",
    subtitle: "The Cluster",
    sageLine:
      "Production runs on Kubernetes. That sounds intimidating, but a cluster is just a *fleet of computers* you talk to with one CLI.\n\nWe'll spin one up locally and poke at it until it makes sense.",
  },
  ch04: {
    ordinal: "Chapter Four",
    subtitle: "The GitOps Loop",
    sageLine:
      "Last stop: **FluxCD**. We let git become the source of truth for the cluster - push a commit, watch the world reshape.\n\nThis is where it all clicks.",
  },
};

export interface ChapterIntroProps {
  chapter: ChapterId;
}

export default function ChapterIntro({ chapter }: ChapterIntroProps) {
  const meta = CHAPTER_INTROS[chapter];
  const summary = useGameStore(selectChapter(chapter));
  const goTo = useGameStore((s) => s.goTo);

  const title = summary?.title ?? meta.subtitle;
  const introSource = useMemo(
    () =>
      `# ${meta.ordinal}\n\n## ${title}\n\n${meta.sageLine}`,
    [meta, title],
  );

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-6 p-8">
      <DialogueBox
        speaker="Sage"
        source={introSource}
        onComplete={() => goTo({ kind: "chapter-map", chapter })}
      />

      <div className="flex justify-between text-xs text-cosmos-muted">
        <button
          type="button"
          onClick={() => goTo({ kind: "title" })}
          className="rounded px-2 py-1 hover:text-phosphor-400"
        >
          ← Back to title
        </button>
        <button
          type="button"
          onClick={() => goTo({ kind: "chapter-map", chapter })}
          className="rounded px-2 py-1 hover:text-phosphor-400"
        >
          Skip intro →
        </button>
      </div>
    </main>
  );
}
