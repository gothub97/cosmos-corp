# Git wins

**Sage** cracks their knuckles.

> "My favourite mission. So far git changed and the cluster obediently
> followed. Now let's test the other direction - what happens when someone
> messes with the *cluster* directly, the way people actually do under
> pressure?
>
> The app's running three pods, matching the repo. You're going to sabotage
> it: scale the live Deployment down to one pod with plain `kubectl`, no git
> involved. That's **drift** - the cluster and the source of truth now
> disagree. Git says 3, reality says 1.
>
> Then watch. Flux's Kustomization re-applies the manifest on its interval -
> and the manifest says `replicas: 3`. So Flux scales it right back up. You
> can wait up to a minute for the automatic reconcile, or force it now with
> `flux reconcile kustomization cosmos-web -n default`.
>
> Two beats:
>
> 1. **Drift it**: `kubectl -n default scale deploy/cosmos-web --replicas=1`.
> 2. **Watch it heal**: the pods climb back to three, with no help from you.
>
> This is why GitOps engineers sleep at night. The cluster can't quietly rot
> away from what's in git - Flux keeps dragging it back."

---

The lesson lands hardest if you *watch* the cluster view: two pods die, then
moments later Flux brings them right back. Git always wins.
