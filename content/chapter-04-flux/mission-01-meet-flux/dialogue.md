# Meet Flux

**Sage** pulls the cluster view over so it fills the top panel.

> "Before you drive Flux, meet it. It's already running in this cluster - I
> installed it for you so we can skip the boilerplate and get to the good
> part. But 'it's running' is a claim, and you never take a claim on trust.
>
> Flux is just a set of *controllers* - pods, living in a namespace called
> `flux-system`, each one watching for a kind of object and reconciling the
> cluster toward it. This lab runs two of them: the **source-controller**
> (fetches git repos) and the **kustomize-controller** (applies what the
> source fetched). That's the whole engine.
>
> Three moves to get your bearings:
>
> 1. `flux check` - confirm the toolkit is healthy.
> 2. `kubectl get pods -n flux-system` - see the controllers are *just pods*.
> 3. `flux get all` - ask Flux what it's currently managing (spoiler: nothing
>    yet - that's your job, starting next mission)."

---

All read-only. You're taking inventory, not changing anything. Watch the
`flux-system` pods light up green in the cluster view as you look.
