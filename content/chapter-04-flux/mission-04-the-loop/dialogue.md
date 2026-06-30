# Close the loop

**Sage** leans in, grinning.

> "This is the one. Everything so far was setup - now you get to *feel* GitOps.
>
> Right now `cosmos-web` runs two pods, because the repo says `replicas: 2`.
> You're going to make it three. But here's the rule that matters: **you will
> not touch the cluster.** No `kubectl scale`. You change the cluster by
> changing *git*, and you let Flux carry it across.
>
> The flow:
>
> 1. **Edit** `~/work/cosmos-deploy/deploy/cosmos-web.yaml` - change
>    `replicas: 2` to `replicas: 3`. That's your working clone of the repo.
> 2. **Commit** it: `git -C ~/work/cosmos-deploy commit -am \"scale cosmos-web to 3\"`.
> 3. **Push** it: `git -C ~/work/cosmos-deploy push`. Now the repo Flux watches
>    has your new commit.
> 4. **Reconcile**: `flux reconcile kustomization cosmos-web --with-source -n default`
>    - re-fetch the repo and re-apply, right now.
>
> Then watch the cluster view. A third pod is going to appear - not because you
> told the cluster to make one, but because you told *git*, and Flux noticed.
>
> That gap between 'I changed a file' and 'the cluster changed itself' is the
> whole idea. Go."

---

`--with-source` on the reconcile is the important bit: it re-fetches your push
*before* re-applying. Without it, Flux re-applies the old commit and nothing
moves.
