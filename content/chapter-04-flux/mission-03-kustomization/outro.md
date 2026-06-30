# Git just deployed an app

**Sage** watches the cluster view fill in: source, Kustomization, Deployment,
two pods, all green.

> "Look at that chain. A GitRepository feeds a Kustomization, the Kustomization
> applied `deploy/cosmos-web.yaml`, and now there's a real app running - two
> nginx pods you never launched by hand. You declared what you wanted in git,
> and Flux made it true.
>
> And it *stays* true. The Kustomization re-applies every minute. If a pod
> dies, the Deployment replaces it (Chapter 3 reflexes). If the whole
> Deployment vanished, Flux would put it back from git on the next reconcile.
> The repo is the source of truth, and Flux is the thing that enforces it.
>
> So far you've only ever *built* the loop. Next mission you'll *use* it the
> way you will every day on the job: change a number in git, push, and watch
> the cluster reshape itself to obey. That's the whole point of GitOps - and
> it's genuinely fun to watch."

→ Mission 04 unlocked.
