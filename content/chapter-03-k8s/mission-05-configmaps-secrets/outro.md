# Configuration that isn't code

**Sage** stretches.

> "ConfigMaps and Secrets are the same shape with different sensitivity
> labels. The wiring patterns are identical: env vars or mounted files.
>
> Two production gotchas worth banking now:
>
> - **Pods don't auto-reload** when a ConfigMap changes. The new value is in
>   the API but the running container won't see it until the pod restarts
>   (or you mount via a Volume - those *do* eventually update, but with a
>   delay).
> - **Secrets are base64, not encrypted.** Anyone with `get secret`
>   permission can decode them. Lock down RBAC and turn on encryption-at-rest
>   when it actually matters.
>
> One last mission this week, and it's the most realistic: a broken
> deployment lands in your namespace and you have to fix it, live."

→ Mission 06 unlocked.
