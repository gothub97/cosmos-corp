# Break it, read it, fix it

**Sage** turns the cluster view toward you - there's red in it.

> "Final mission, and I've already sabotaged it for you. Someone - let's say
> it was me - pushed a bad commit to the repo. The `cosmos-web` manifest now
> points at an image tag that doesn't exist, and Flux dutifully tried to apply
> it. The Kustomization is red, the pods can't start. This is a Tuesday.
>
> The skill here isn't avoiding mistakes - everyone ships bad commits. The
> skill is *reading the failure fast* and *fixing it forward*. Three beats:
>
> 1. **Diagnose.** Start at the Flux layer and trace down:
>    - `flux get kustomizations -n default` - see it's `READY False`, read the message.
>    - `kubectl -n default describe kustomization cosmos-web` - conditions + events.
>    - `flux logs` - the controller's raw error.
>    - `kubectl get pods -n default` - the root cause: an image that won't pull.
> 2. **Fix it in git.** Edit `~/work/cosmos-deploy/deploy/cosmos-web.yaml`,
>    set the image back to `nginx:alpine`, commit, push. You do NOT
>    `kubectl edit` the live object - that's drift, and Flux would just
>    overrule you. Fix the source of truth.
> 3. **Reconcile** and watch it go green:
>    `flux reconcile kustomization cosmos-web --with-source -n default`.
>
> The whole chapter in one mission: read the cluster, fix git, let Flux carry
> it. Go close it out."

---

Tip: the failure shows up at every layer, but the *fix* only belongs in one -
git. Trace down to find the cause, then climb back to git to correct it.
