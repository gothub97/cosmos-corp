# You've met the engine

**Sage** nods at the two green pods in the cluster view.

> "There it is - no magic, just two controllers sitting in `flux-system`,
> waiting for something to reconcile. `flux check` told you they're healthy,
> `kubectl get pods` proved they're ordinary workloads, and `flux get all`
> showed you the inventory: empty, because you haven't pointed Flux at
> anything yet.
>
> That's the mental model that makes the rest of the chapter click: Flux is a
> control loop. It reads a desired state from somewhere, compares it to the
> live cluster, and closes the gap - over and over, forever.
>
> The 'somewhere' is git. Next you'll give Flux its first job: a **source** -
> a git repo for it to watch."

→ Mission 02 unlocked.
