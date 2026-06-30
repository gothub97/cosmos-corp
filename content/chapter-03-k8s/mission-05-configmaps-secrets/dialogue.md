# ConfigMaps & Secrets

**Sage** pulls up a config file on the side screen.

> "Hardcoding configuration into a container image is a mistake every team
> makes once. Same image, different environments, different config - that's
> the goal. Kubernetes has two flavours of config-out-of-image:
>
> - **ConfigMap** - non-secret key/value data. Feature flags, hostnames,
>   tuning knobs. Stored as plain text.
> - **Secret** - same shape, intended for *sensitive* data. Stored
>   base64-encoded (and, if your apiserver is configured for it, encrypted
>   at rest). Same wiring patterns as ConfigMap.
>
> Three things to do:
>
> 1. Create a ConfigMap called `cosmos-config` with a few keys.
> 2. Create a Secret called `cosmos-secret` with a token.
> 3. Run a pod that consumes `cosmos-config` as environment variables -
>    `envFrom` is the magic word.
>
> Take a peek at `~/manifests/app-config.yaml` for a full YAML example you
> can adapt - it shows BOTH ways to consume a ConfigMap (env vars and
> mounted files)."

---

If the `--overrides` JSON in the lesson looks scary, that's normal. Real teams use YAML files; you'll meet `kubectl apply -f` in Chapter 4.
