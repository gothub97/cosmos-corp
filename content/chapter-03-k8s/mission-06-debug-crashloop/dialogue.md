# A broken deployment, on your desk

**Sage** (over Slack, urgent tone but not panicked):

> "Hey - somebody (definitely not me) deployed a broken thing into your
> namespace. The cluster view's already painted the pod red. Three steps,
> in order:
>
> 1. **Describe** the pod (or the Deployment) - read the *Events:* section.
>    The error is in there in plain English.
> 2. **Try logs** - even though you'll get nothing back. Building the reflex
>    of *also reach for logs* matters. (For a real CrashLoopBackOff,
>    `kubectl logs --previous` would save you.)
> 3. **Fix the image.** The bad tag is `nginx:cosmos-broken-do-not-exist`.
>    Replace it with any pullable tag - `nginx:alpine` is fine. You can use
>    `kubectl edit deploy/broken` (opens nano) or `kubectl set image` for a
>    one-shot patch.
>
> Watch the cluster view as you fix it. Red → amber → green. That's the
> reconciliation loop in action - every Kubernetes engineer's favourite
> dopamine hit."

---

If `kubectl edit` opens an editor and you've never used nano: write the change, **Ctrl+O** to save, **Enter** to confirm filename, **Ctrl+X** to exit.
