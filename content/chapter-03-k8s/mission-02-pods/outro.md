# One pod's whole life, in five commands

**Sage** spins their chair around.

> "That's the unit. *Everything* on Kubernetes - Deployments, StatefulSets,
> Jobs, the lot - eventually boils down to managing pods on your behalf.
>
> Notice the cluster view's empty again. The pod existed for a couple of
> minutes, served you, got deleted. That's how throwaway work feels on a
> cluster - fast, observable, no ceremony.
>
> Pods are great for one-offs but you wouldn't run *production* off a bare
> `kubectl run` - there's nothing to bring it back if it crashes. Next we
> meet the controller that does that for you: the **Deployment**."

→ Mission 03 unlocked.
