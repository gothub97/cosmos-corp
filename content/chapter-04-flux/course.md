# Chapter 4 - The GitOps Loop: Flux in the Cluster

*Sage closes the terminal from Chapter 3 and opens a new one.*

> "Three chapters. Terminal moves. Git discipline. Kubernetes objects and the
> reconciliation loop. You've been building toward this without knowing it.
> This chapter is where it clicks.
>
> Everything you've learned is about to become a system - one that runs
> itself."

---

## What this chapter is about

In Chapter 3 you learned that Kubernetes is a *reconciliation engine*: you
declare desired state, the control plane compares it against reality, and
controllers continuously close the gap. The cluster watches itself.

That's a powerful idea. But notice what you were doing by hand: editing
manifests, running `kubectl apply`, patching deployments directly. *You* were
the thing that decided when to update the cluster and what to tell it. That
made you a single point of failure, a bottleneck, and a source of undocumented
changes.

GitOps is the answer. The core claim is simple enough to fit in one sentence:

> **Git is the source of truth. The cluster pulls from git and reconciles
> toward it - automatically, continuously, without a human in the middle.**

Flux is the implementation of that idea in Kubernetes. Six missions from now
you'll have built it, broken it, watched it self-heal, and debugged a failure
from root cause to recovery. By the end, what Chapter 3 called "the
reconciliation loop" will mean something bigger.

---

## Part 1 - The mental model: GitOps principles

The word "GitOps" gets overloaded. Let's anchor to the definitions that the
[OpenGitOps](https://opengitops.dev/) working group published, because they're
precise:

**1. Declarative** - The desired state of the system is expressed
declaratively. You write *what you want*, not *how to get there*. A
Kubernetes manifest that says `replicas: 3` is declarative. A shell script that
runs `kubectl scale --replicas=3` is imperative. The difference matters because
declarations can be stored, diffed, audited, and re-applied idempotently.

**2. Versioned and immutable** - Desired state is stored in a way that
enforces immutability, versioning, and retains a complete version history. Git
is the canonical answer here. Every change is a commit. Every commit has a
SHA, an author, a timestamp, and a message. The history is the audit log.
Roll back by reverting a commit - no bespoke "undo" mechanism required.

**3. Pulled automatically** - Software agents automatically pull the desired
state declarations from the source. This is the architectural flip that
distinguishes GitOps from conventional CI/CD. In a push-based pipeline, your
CI server needs cluster credentials to run `kubectl apply`. In a pull-based
system, an agent *inside* the cluster fetches from git using its own
credentials and applies changes locally. The cluster reaches out; nothing
reaches in.

**4. Continuously reconciled** - Software agents continuously observe actual
system state and attempt to apply the desired state. This is the Chapter 3
control loop, extended: not just "apply when I push," but "compare and
correct on an interval, forever." Drift gets fixed automatically, not when
someone notices.

### Why it matters: push vs. pull

You've been doing push-based ops all along and it works fine for a lab. Here
is where it breaks in production:

- The CI server needs cluster credentials. Those credentials become a target.
- A deploy pipeline that fails halfway leaves the cluster in an unknown state.
- Manual `kubectl` commands leave no record unless someone documents them.
- Drift accumulates silently: someone patches a live pod, nobody writes it
  down, the next deploy overwrites it or doesn't, and now nobody knows what
  the cluster is actually running.

Pull-based GitOps sidesteps all four. The cluster reconciles toward git. Git
has the full history. No external system needs write access to the cluster.
And drift is corrected automatically, not by memory.

---

## Part 2 - Flux: controllers all the way down

Flux is not a monolith. It is a set of specialized Kubernetes controllers -
just pods, running in a namespace called `flux-system` - each responsible for
one kind of object. The official name is the **GitOps Toolkit** (gotk).

This chapter uses two of them. Understand these two and you understand the
engine.

### The source-controller

The source-controller's job is **fetching**. It watches `Source` objects -
`GitRepository`, `OCIRepository`, `HelmRepository`, `Bucket` - and produces
**artifacts**: compressed TAR archives stored locally in the controller's
storage. Other controllers consume these artifacts; they never talk to git
directly.

Think of source-controller as a librarian. It goes to the git remote, checks
whether anything changed, downloads the new revision, and puts a labeled copy
on the shelf. Other controllers come to the library; they don't go to the
bookstore themselves.

The artifact includes:

- A URL other in-cluster controllers can fetch it from
- The revision (branch + commit SHA)
- A SHA-256 digest for integrity verification

### The kustomize-controller

The kustomize-controller's job is **applying**. It watches `Kustomization`
objects, fetches the artifact that object points to, builds the manifests
(running Kustomize if a `kustomization.yaml` is present, or treating it as
plain YAML otherwise), and applies them to the cluster using server-side
apply.

It also:

- **Prunes** resources that disappear from the git revision (garbage
  collection - so a deleted file means a deleted object in the cluster)
- **Health-checks** rollouts, waiting for Deployments to become Ready before
  marking reconciliation as successful
- **Detects and corrects drift** at its configured interval

Every ten minutes (by default, and configurable), the kustomize-controller
runs a server-side apply dry-run against the cluster and reapplies anything
that has drifted from the desired state. Manual `kubectl` edits do not survive.

### The two-controller pipeline

```
                 ┌─────────────────────────────────────────────────┐
  git remote ──► │  source-controller         kustomize-controller  │
                 │   GitRepository              Kustomization        │
                 │     ↓ fetch                   ↓ build + apply    │
                 │   artifact ────────────────► cluster objects      │
                 └─────────────────────────────────────────────────┘
                                         flux-system namespace
```

The source-controller does not know what to do with manifests. The
kustomize-controller does not know how to talk to git. Neither can work
without the other. The CRDs are the interface between them.

---

## Part 3 - The CRDs: what you actually write

You interact with Flux by creating Custom Resources. Two CRDs cover everything
in this chapter.

### GitRepository - declaring a source

A `GitRepository` tells the source-controller: "watch this repo, at this
branch, on this interval."

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: cosmos-deploy
  namespace: flux-system
spec:
  interval: 1m0s
  url: https://github.com/cosmos-corp/cosmos-deploy
  ref:
    branch: main
```

Key fields:

| Field | What it does |
|---|---|
| `spec.url` | HTTP/S or SSH address of the repository |
| `spec.ref.branch` | Branch to track (or `.tag`, `.semver`, `.commit`) |
| `spec.interval` | How often to check for new commits |
| `spec.secretRef` | Reference to a `Secret` holding credentials (for private repos or SSH) |
| `spec.suspend` | Set to `true` to pause fetching without deleting the object |

When the controller finds a new commit, it clones the revision, archives it as
a `.tar.gz`, and writes the artifact URL and digest into `.status.artifact`.
That status entry is what the kustomize-controller reads.

**Status to know:**

```
$ flux get sources git -n flux-system
NAME            REVISION          SUSPENDED READY  MESSAGE
cosmos-deploy   main@sha1:a3f9c1  False     True   stored artifact for revision 'main@sha1:a3f9c1'
```

`READY True` with a revision means source-controller has a good artifact on
the shelf. `READY False` with a message tells you what went wrong: credentials
missing, remote unreachable, revision not found.

### Kustomization - declaring what to apply

A `Kustomization` tells the kustomize-controller: "take the artifact from this
source, look in this path, and apply it to the cluster."

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: cosmos-web
  namespace: default
spec:
  interval: 10m0s
  sourceRef:
    kind: GitRepository
    name: cosmos-deploy
    namespace: flux-system
  path: ./deploy
  prune: true
  timeout: 1m
```

Key fields:

| Field | What it does |
|---|---|
| `spec.sourceRef` | Which `GitRepository` (or other source) to pull from |
| `spec.path` | Directory inside the artifact to build from |
| `spec.interval` | How often to reconcile (drift-check and re-apply) |
| `spec.prune` | If `true`, resources deleted from git are deleted from the cluster |
| `spec.timeout` | How long to wait for apply + health checks before failing |
| `spec.suspend` | Pause reconciliation without deleting the object |
| `spec.healthChecks` | Resources to watch for rollout completion |

The `spec.sourceRef` is the link. It points from the Kustomization to the
GitRepository, by name, in whichever namespace the source lives. When the
source-controller produces a new artifact, the kustomize-controller picks it
up and re-applies.

> **Gotcha - prune:** `prune: true` means Flux owns the lifecycle of every
> object it applies. Delete a file from git, and the corresponding
> Kubernetes resource disappears from the cluster on the next reconcile. This
> is usually what you want - but be deliberate about it. `prune: false` is
> safer during early adoption if you're not confident everything you care about
> is tracked in git.

---

## Part 4 - The reconcile loop and drift correction

Here is the full picture of what happens when you push a commit:

```
1.  You: git commit && git push
2.  source-controller: polls GitRepository (interval elapsed, or triggered manually)
3.  source-controller: detects new commit SHA
4.  source-controller: clones the revision, archives it, updates .status.artifact
5.  kustomize-controller: watches GitRepository; artifact revision changed → requeue
6.  kustomize-controller: fetches artifact from source-controller's storage
7.  kustomize-controller: runs kustomize build (or treats as plain YAML)
8.  kustomize-controller: server-side apply to cluster
9.  kustomize-controller: health-checks referenced resources
10. kustomize-controller: updates Kustomization .status.conditions → Ready True
```

Steps 2–10 happen without you. The interval in `GitRepository` is the worst-
case latency - how long before Flux notices a push. In production, you
typically combine a short interval (1–5 minutes) with a webhook receiver so
Flux re-fetches immediately on push. In this lab the interval is short and
`flux reconcile --with-source` lets you skip the wait entirely.

### The `--with-source` flag

When you run:

```bash
flux reconcile kustomization cosmos-web --with-source -n default
```

the `--with-source` flag tells Flux to re-fetch the source *first*, then
re-apply. Without it, the kustomize-controller re-applies the last artifact
it already has - which is the previous commit. You pushed something new but
Flux doesn't know yet. Always use `--with-source` when you want your latest
push reflected immediately.

### Drift correction

Once a Kustomization is reconciling successfully, it keeps going. On every
interval, the kustomize-controller performs a server-side apply dry-run against
the live cluster and reapplies anything that diverged from the current
artifact.

What this means in practice:

```bash
# You manually scale down (drift)
kubectl -n default scale deploy/cosmos-web --replicas=1

# Flux's next reconcile (or force it now):
flux reconcile kustomization cosmos-web -n default

# Cluster returns to git's declared state
kubectl get deploy/cosmos-web -n default
# NAME         READY   UP-TO-DATE   AVAILABLE
# cosmos-web   3/3     3            3
```

Git says three. Reality said one. Flux made it three again.

This is not a side effect - it is the feature. The cluster cannot quietly rot
away from git. Any change made outside Flux is undone at the next reconcile.
That guarantee is what makes GitOps trustworthy.

> **Consequence:** if you need to make an emergency manual change to a live
> cluster, Flux will undo it. The workflow is: make the change in git, push,
> reconcile. If you must act before git is ready, use `flux suspend` to pause
> the Kustomization, make the manual change, fix git, push, then `flux resume`.
> Never fight the reconciler - work with it.

---

## Part 5 - Troubleshooting: reading the failure

When something goes wrong with Flux, the failure appears at multiple layers.
The skill is tracing from the top down to find the root cause, then climbing
back to git to fix it.

### The diagnostic ladder

Start at the Flux layer, not the pod layer:

```bash
# Step 1: is the Kustomization healthy?
flux get kustomizations -n default
# NAME        REVISION   SUSPENDED  READY  MESSAGE
# cosmos-web  -          False      False  Apply failed: ...

# Step 2: more detail on the condition
kubectl -n default describe kustomization cosmos-web
# Conditions:
#   Type:    Ready
#   Status:  False
#   Reason:  ApplyFailed
#   Message: ...

# Step 3: raw controller logs
flux logs --kind=Kustomization --name=cosmos-web -n default

# Step 4: check pods - the ultimate ground truth
kubectl get pods -n default
kubectl describe pod <pod-name> -n default
```

Work top-down. The Kustomization conditions often give you a readable error
message without having to dig into pod events. But when the Kustomization says
"applied successfully" and pods are still failing, you need to go deeper - the
manifest was valid YAML that applied cleanly, but the image doesn't exist or
the container crashes on startup.

### Common failure modes

**Source not ready**

```
flux get sources git -n flux-system
# READY False   failed to checkout ref: reference not found
```

The GitRepository can't reach the remote or the branch doesn't exist. Check
credentials (`spec.secretRef`), the URL, and the branch name.

**Apply failed**

```
flux get kustomizations -n default
# READY False   ConfigMap "cosmos-config" already exists and is not managed by Flux
```

A resource exists in the cluster but was created outside Flux (no
`kustomize.toolkit.fluxcd.io/name` label). Flux can't adopt it safely. Either
delete the conflicting resource, or annotate it to transfer ownership.

**Image pull error**

The Kustomization may show `READY True` - the manifest applied without error -
but the pods crash because the image tag doesn't exist. Always check pod
events as the final step:

```bash
kubectl -n default describe pod <pod-name>
# Events:
#   Failed to pull image "nginx:cosmos-broken-do-not-exist": ...
```

Fix: edit the manifest in git. Change the image tag. Commit. Push.
Reconcile. Do not `kubectl edit` the live Deployment - Flux will overwrite it.

### Suspend and resume

When a Kustomization is failing and you need time to diagnose without Flux
continuously retrying and generating noise:

```bash
# Pause reconciliation
flux suspend kustomization cosmos-web -n default

# Diagnose, fix git, push...

# Resume
flux resume kustomization cosmos-web -n default
```

Suspend sets `spec.suspend: true` on the object. The kustomize-controller
sees it and stops reconciling. Drift detection also pauses. `flux resume`
clears the flag and triggers an immediate reconcile.

> **Remember:** suspending is a diagnostic tool, not a solution. If you leave
> a Kustomization suspended, drift accumulates silently and you lose the
> guarantee that git is the source of truth. Suspend, fix, resume - in that
> order.

---

## Part 6 - How this connects to the missions

The six missions in this chapter build the Flux pipeline from the ground up,
one concept at a time. Here is the conceptual arc:

**Mission 1 - Meet Flux:** Flux is already installed in the cluster. You
confirm it with `flux check` and then look at it as what it actually is -
pods in `flux-system`, each watching for a CRD. The engine exists; you haven't
given it anything to manage yet.

**Mission 2 - Git source:** You create the first `GitRepository` object. The
source-controller starts watching your repo. You watch `.status.artifact`
populate with a revision and digest. The librarian has the first book on the
shelf.

**Mission 3 - Kustomization:** You create the `Kustomization` that points at
the source. The kustomize-controller fetches the artifact, builds the
manifests, and applies them. For the first time, resources appear in your
namespace that you never ran `kubectl apply` for. Flux applied them.

**Mission 4 - The loop:** You feel the GitOps loop in full. Edit a file in
your local clone, commit, push, reconcile. The cluster changes - not because
you told it to, but because you told git, and Flux noticed. That gap between
"I changed a file" and "the cluster changed itself" is the whole idea.

**Mission 5 - Self-heal:** You introduce drift deliberately - `kubectl scale`
down the live Deployment. Then you watch Flux's next reconcile undo your
change. The cluster returns to three pods without any help from you. Git wins.

**Mission 6 - Troubleshoot:** A bad commit is already in the repo. The
Kustomization is red. You trace the failure from `flux get kustomizations`
down to pod events, identify a broken image tag, fix it in git, push, and
reconcile back to green. The whole chapter in one mission.

---

## Part 7 - Closing the loop on Chapter 3

In Chapter 3, Sage introduced the reconciliation loop in the context of a
Deployment:

> "Watch the cluster view as you fix it. Red → amber → green. That's the
> reconciliation loop in action."

Kubernetes controllers - the ReplicaSet controller, the Deployment controller -
continuously compare desired state (the spec you wrote) against observed state
(what's actually running) and make changes to close the gap.

Flux extends this idea one level up:

| Layer | Desired state | Observed state | Controller |
|---|---|---|---|
| Chapter 3 | Pod spec in Deployment | Running pods | ReplicaSet controller |
| Chapter 4 | Manifests in git | Objects in cluster | Kustomize-controller |

The kustomize-controller is a Kubernetes controller in exactly the same sense
as the ReplicaSet controller. It has a desired state (the artifact from git)
and an observed state (what's deployed). It reconciles, continuously, on an
interval. The difference is that the desired state now lives in git - not just
in-cluster - which means it's versioned, auditable, and shared.

This is also why `flux reconcile` feels similar to letting Kubernetes recover
a crashed pod. You're not telling the cluster what to do; you're letting a
controller do its job sooner than it would have on its own schedule.

> "Three chapters. Terminal moves. Git discipline. Kubernetes objects and the
> reconciliation loop. You've been building toward this without knowing it.
> This chapter is where it clicks."

It clicked because the terminal let you read logs, git gave you a versioned
source of truth, and Kubernetes gave you the reconciliation model. Flux
combines all three into a system that runs itself.

---

## Further reading - official docs

- [Flux Core Concepts](https://fluxcd.io/flux/concepts/) - GitOps definition,
  Sources, Kustomization, reconciliation, bootstrap
- [Flux Toolkit Components](https://fluxcd.io/flux/components/) - overview of
  all controllers and their CRDs
- [source-controller / GitRepository](https://fluxcd.io/flux/components/source/gitrepositories/)
  - full GitRepository CRD reference: fields, authentication, artifact output,
  status conditions
- [kustomize-controller / Kustomization](https://fluxcd.io/flux/components/kustomize/kustomizations/)
  - full Kustomization CRD reference: sourceRef, path, prune, health checks,
  drift correction, status conditions
- [OpenGitOps Principles](https://opengitops.dev/) - the four GitOps
  principles (declarative, versioned and immutable, pulled automatically,
  continuously reconciled)
