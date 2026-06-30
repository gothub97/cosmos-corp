# Sage - Character Bible

*Canon reference for all writing, voiceover, and UI copy featuring Sage.  
Open this file before writing a single line of dialogue.*

---

## Identity

**Full name / handle:** Sage (no last name given; everyone at Cosmos Corp just says "Sage").

**Role:** Senior Infrastructure & Site Reliability Engineer at Cosmos Corp. Has been there long enough that onboarding new engineers is just part of the job description now, even though it never made it into the title.

**Short backstory:** Started in sysadmin when "the cloud" meant "someone else's server room." Survived the containerization wave, helped migrate Cosmos Corp off bare metal, watched the GitOps paradigm get invented, and is now paid to make sure the next generation doesn't have to learn all of it the hard way. Has seen prod burn - literally, a datacenter fire in 2018 - and the more figurative kind many times since. Doesn't panic. Has a Slack DND that is never actually enabled.

**Physical presence:** Bearded, mid-forties, the kind of person whose desk has three monitors but only one ever has a GUI on it. Favourite mug is from a conference five years ago; the ink on the logo is starting to crack. Usually in the office when you arrive, hasn't left yet when you lock up.

---

## Appearance (avatar specification)

Sage's UI avatar is a minimalist geometric SVG bust, rendered in the game's phosphor-green-on-dark-panel CRT aesthetic. Think ASCII art promoted to vector: clean strokes, no gradients, no photorealism.

Key features encoded in the SVG:
- **Rectangular head** - slightly rounded corners, geometric not oval. Communicates solidity and reliability rather than softness.
- **Horizontal-bar eyes** - two short filled rectangles, conveying a steady, calm gaze.
- **Beard** - the defining identifier. A trapezoid-ish filled polygon hanging below the jaw, with three vertical stroke lines suggesting texture. This is what makes Sage *Sage* at 28px.
- **Ear stubs** - two small rectangles flanking the head, keeping the silhouette readable at small sizes.
- **Colourway** - `var(--color-phosphor-400)` (#4cd996) strokes and fills on a `var(--color-cosmos-panel)` (#0d1117) background. Everything is a single phosphor-green tone; no secondary colours.

The avatar occupies three sizes: `sm` (28 px), `md` (40 px), `lg` (72 px). The viewBox is always `0 0 40 40`; SVG scaling handles the rest.

Accessibility: `role="img"` with `aria-label="Sage"`.

---

## Personality & values

**Encouraging, never condescending.** Sage assumes the learner is smart and just needs the right frame. He doesn't say "it's easy" - he says "let's go," "take your time," "take a beat." The difficulty is acknowledged; the fear is not amplified.

**Physically present.** He leans over your shoulder, wheels their chair over, swivels around to face you, slides a problem across the desk. Even when it's Slack (urgent tone but not panicked), the physicality bleeds through. Sage is *there*, not managing from a distance.

**Grounded in real practice.** Every piece of advice comes from having done it in production, sometimes badly. Rules-of-thumb ("the Events block is more useful than logs 80% of the time") are more useful to Sage than theoretical correctness.

**Building-block framing.** Sage never dumps the whole map. He gives the minimum viable mental model first ("git is just a tool that takes snapshots"), then the step list, then sends you off. The rest follows naturally once the thing clicks.

**Dry self-deprecating humour.** Never at the learner's expense. Sage is the butt of his own jokes ("somebody - definitely not me - deployed a broken thing"). He raises "an imaginary glass," fires off "mock celebration." The absurdity is always directed inward or at the situation.

**Honest about difficulty.** "The first conflict you ever resolve is the scariest. After this, they're annoying but boring." He doesn't pretend the job is uniformly pleasant - he just demystifies why it's hard and explains that it gets boring (which is better).

**Cares about good habits, not just correct commands.** What Sage reinforces is the *reflex* - reach for `describe` first, never force-push to a shared branch, make your fix reproducible. The specific command matters less than the decision-making pattern.

---

## Voice rules

These rules are distilled from the 22 shipped missions. Quote them internally; they are constraints, not suggestions.

**1. Short sentences with long implications.**  
Don't explain everything - land the framing sentence, then let the steps carry the rest.  
*Evidence:* "A shell session always has a *current directory*. Half of all shell commands either operate on the current directory, or move you to a new one." - `chapter-01/mission-01/dialogue.md`

**2. Numbered lists for sequences; bullets for principles.**  
When there's an order, number it. When there's a set of habits, bullet it. Never mix.  
*Evidence:* Three-step sequences in every chapter opener; bullet list of "three habits worth banking" in `chapter-03/mission-06/outro.md`.

**3. Spaced hyphens for interruptions and parentheticals, not parentheses.**  
Sage thinks in spoken cadence; a spaced hyphen ( - ) approximates the slight pause of a speaker correcting mid-sentence. Do not use em dashes (the long dash character, Unicode U+2014) anywhere in the game's writing - use a spaced hyphen or a comma instead.  
*Evidence:* "Flux is just a set of *controllers* - pods, living in a namespace called `flux-system`, each one watching for a kind of object" - `chapter-04/mission-01/dialogue.md`

**4. Italics for the *name* of a concept at first use; bold for warnings and named entities.**  
"Each snapshot is called a **commit**" vs "a *current directory*." Italics introduce vocabulary; bold marks what to not screw up.  
*Evidence:* "each snapshot is called a **commit**" - `chapter-02/mission-01/dialogue.md`; "the things actually *running* on the machine" - `chapter-01/mission-06/dialogue.md`

**5. Completions end with a forward door, not a summary.**  
The outro is "here's what you earned" + "here's what's next" - always forward-facing. He doesn't recap the whole lesson; he names the most important habit and opens the door.  
*Evidence:* "Next up: cleaning up messy local history with `git rebase -i`." - `chapter-02/mission-06/outro.md`; "get some rest - Chapter 4 is GitOps, and it's wild." - `chapter-03/mission-06/outro.md`

**6. First-person self-deprecation, not character-deprecation.**  
Sage is the one who deployed the broken thing, left the bad branch, rigged the conflict. The learner is never set up to fail; Sage is.  
*Evidence:* "somebody (definitely not me) deployed a broken thing into your namespace" - `chapter-03/mission-06/dialogue.md`; "I left a branch called `feature/onboarding` with three commits on it, and they're a mess" - `chapter-02/mission-07/dialogue.md`

---

## Do / Don't

| Do | Don't |
|---|---|
| Acknowledge that something is hard or scary | Say "it's actually really simple" |
| Name the concrete habit, not just the command | Dump a wall of options and flags |
| Use real Cosmos Corp context (namespace names, cluster view references) | Use generic tutorial examples ("foo", "bar") |
| Let celebration be brief and slightly absurd ("raises an imaginary glass") | Write triumphant hero moments for the learner |
| Forward-reference the next thing immediately | End on a wrap-up that goes nowhere |
| Address the learner directly ("you") | Use passive voice or third person |
| Mention Slack, the office, the mug, physical presence | Make Sage feel like a disembodied voice |
| Use `backticks` for commands and flags inline | Spell out commands in plain prose |

---

## Vocabulary & verbal tics

- **"Let's go."** - launch phrase at the end of setup beats. Low-key, not a cheer.
- **"Take a beat."** - slow-down cue, always sincere, never condescending.
- **"Take your time."** - appears in tutorials that have no time pressure. Signals safety.
- **Clicking/clicking into place** - preferred metaphor for understanding: "once these click," "the rest clicks," "here's what makes this click."
- **Loop / reconciliation loop** - his mental model for k8s and GitOps. He returns to it.
- **"The thing every [X] does"** - normalises the task: "the thing every developer in the company does dozens of times a day."
- **Action verbs over noun phrases** - "commit, push, pull" not "perform a commit operation."
- **Specific tools** - always names the exact tool. `kubectl describe`, not "inspect the resource."
- **No "obviously," "simply," "just" (except "just pods," "just a snapshot")** - the one exception is using "just" to *shrink* something scary: "Flux is just a set of controllers - pods." This reframe is intentional; using it elsewhere dilutes it.

---

## Sample lines by chapter

### Chapter 1 - The Terminal

*Intro:*
> "Welcome to Cosmos Corp. Before we touch a cluster, before we touch a repo, we live in the *terminal*. Don't worry about memorising every flag - we'll build muscle memory together, one command at a time."

*Mid-mission nudge:*
> "Two more things you need to feel comfortable with before we leave the terminal chapter: processes - the things actually *running* on the machine - and permissions - what each user is allowed to *do* with a file."

*Outro:*
> "That's the foundation. Every other thing we do this week stacks on top of those three: *where am I*, *what's here*, *let's go somewhere else*. Next up: actually reading what's inside files."

---

### Chapter 2 - The Codebase

*Intro:*
> "Forget every git horror story you've heard. At its core, git is *just a tool that takes snapshots*. Each snapshot is called a **commit**, and a sequence of commits is your project's history."

*Conflict dialogue (the pivotal moment):*
> "The first conflict you ever resolve is the scariest. After this, they're annoying but boring. Let's go."

*Outro after conflict:*
> "You did three things people often forget: you didn't panic at the rejection - you read the error. You didn't `git push --force` - that would have destroyed Captain Q's commit. You actually looked at the file before committing the resolution."

---

### Chapter 3 - The Cluster

*Debug-crashloop dialogue:*
> "Hey - somebody (definitely not me) deployed a broken thing into your namespace. The cluster view's already painted the pod red. Three steps, in order: describe the pod, try logs, fix the image."

*Outro:*
> "When a pod is wrong, `describe` first. The Events block is more useful than logs 80% of the time. When you patch live, prefer `kubectl set image` or a YAML-then-apply over `kubectl edit`. Your fix should be reproducible - copy-pasting from memory at 2am is not."

---

### Chapter 4 - The GitOps Loop

*Intro:*
> "Last stop: **FluxCD**. We let git become the source of truth for the cluster - push a commit, watch the world reshape. This is where it all clicks."

*Mid-chapter:*
> "Flux is just a set of *controllers* - pods, living in a namespace called `flux-system`, each one watching for a kind of object and reconciling the cluster toward it. That's the whole engine."

*Outro:*
> "There it is - no magic, just two controllers sitting in `flux-system`, waiting for something to reconcile. The 'somewhere' is git. Next you'll give Flux its first job: a **source** - a git repo for it to watch."

---

## Avatar spec (for `SageAvatar.tsx`)

```
Component: SageAvatar
Props: { size?: "sm" | "md" | "lg"; className?: string }
Sizes: sm=28px  md=40px  lg=72px
ViewBox: "0 0 40 40"
Colours: var(--color-phosphor-400) on var(--color-cosmos-panel)
Style: geometric line-art, stroke-based, phosphor green
```

The SVG encodes (in order of visual weight):
1. Panel background (full rect, rx=4)
2. Rectangular head with rounded corners
3. Ear stubs (two small flanking rects)
4. Horizontal-bar eyes (two short filled rects)
5. Short nose line
6. Beard polygon (the defining feature) with three vertical texture strokes

No external image files. All geometry is literal SVG paths and primitives.
