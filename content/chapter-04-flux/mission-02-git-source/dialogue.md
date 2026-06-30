# A source to watch

**Sage** drops a repo URL into your notes.

> "Flux is idling - `flux get all` was empty, remember. Time to give it its
> first job. Everything in GitOps starts with a **source**: a pointer at a git
> repo that the source-controller clones and keeps fresh inside the cluster.
>
> There's a repo already waiting for you - `cosmos-deploy`, served from inside
> the cluster at:
>
> `http://git-server.git-system.svc.cluster.local/cosmos-deploy.git`
>
> Why that mouthful instead of a path on disk? Because Flux runs *inside* the
> cluster. The source-controller is a pod - it has to reach the repo over the
> cluster network, so it needs a cluster-routable address, not a `/srv` path
> only your shell can see.
>
> Three beats:
>
> 1. **Create** the GitRepository source - URL, branch `main`, poll every 1m.
> 2. **Reconcile** it so it fetches *now* instead of waiting for the interval.
> 3. **Check** it went `Ready` - proof Flux has a clean copy of the repo.
>
> Creating a source deploys nothing yet. You're just teaching Flux where to
> look. Watch the GitRepository node appear in the cluster view."

---

The source is the foundation. Next mission you'll stack a Kustomization on top
of it and actually deploy the app.
