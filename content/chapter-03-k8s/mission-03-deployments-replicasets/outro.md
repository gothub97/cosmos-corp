# Three pods, one Deployment, zero downtime

**Sage** taps the screen.

> "That's the shape of *every* long-running workload on a Kubernetes cluster
> you'll ever touch. Deployment owns the desired state, ReplicaSet owns the
> set of running pods, pods do the actual work.
>
> Try this in your head: kill a pod with `kubectl delete pod web-...` and
> count to three. The ReplicaSet notices the gap and spawns a fresh one.
> That's the whole reason Kubernetes exists.
>
> Next we make those pods *reachable* - every workload needs an address. We
> meet **Services**."

→ Mission 04 unlocked.
