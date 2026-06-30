# Flux has eyes on the repo

**Sage** points at the GitRepository node glowing green in the cluster view.

> "That's your source, `Ready = True`, with a commit hash next to it. The
> source-controller just cloned `main` and stashed an artifact inside the
> cluster - and it'll re-check every minute, picking up any new commit you
> push. You've connected git to the cluster.
>
> But notice: *nothing got deployed*. The source layer only fetches; it
> doesn't apply. There are no `cosmos-web` pods running yet. That separation
> is deliberate - one object's job is *get the code*, another object's job is
> *apply the code*. Clean seams.
>
> Next you build the second half: a **Kustomization** that takes this source
> and actually rolls the app onto the cluster. That's where the GitOps loop
> first closes."

→ Mission 03 unlocked.
