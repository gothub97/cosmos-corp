# Deploy from git

**Sage** taps the lone GitRepository node in the cluster view.

> "You've got a source - Flux is happily cloning the repo every minute - but
> nothing's deployed. That's because a source only *fetches*. To actually put
> the manifests on the cluster you need the second half of the pair: a
> **Kustomization**.
>
> The Kustomization says: *take this source, look in this folder, and apply
> everything you find - then keep it applied.* The repo has a `deploy/` folder
> with `cosmos-web.yaml` in it: an nginx Deployment, replicas 2, plus a
> Service. The moment you create the Kustomization, kustomize-controller
> applies that file and the app rolls out.
>
> Two flags worth knowing now:
> - `--path=./deploy` - which folder in the repo to apply.
> - `--prune=true` - if you delete a manifest from git, Flux deletes it from
>   the cluster too. Git stays authoritative in *both* directions.
>
> Three beats:
>
> 1. **Create** the Kustomization, wiring it to your GitRepository source.
> 2. **Watch** `cosmos-web` appear - Deployment, ReplicaSet, Pods, all of it.
> 3. **Check** the Kustomization went `Ready` - the cluster now matches git."

---

This is the first time the loop closes: a commit in git became running pods,
and you never typed `kubectl apply`. Watch it light up.
