# A commit became a pod

**Sage** watches the third pod settle into green.

> "There it is. You edited a number in a text file, pushed it, and a new pod
> appeared on the cluster. You never ran `kubectl scale`, never `kubectl
> apply`. The only thing you changed was *git* - and the cluster followed.
>
> Sit with how big that is. The repo is now a complete, reviewable, revertible
> record of what's running. Want to know why there are three pods? `git log`.
> Want to roll back? Revert the commit and reconcile. Want a teammate to
> approve a change before it ships? Pull request. Your whole cluster becomes
> as auditable as your code, because it *is* code.
>
> But I promised you the best part, and it's next. So far git changed and the
> cluster followed. What happens when someone changes the *cluster* by hand,
> behind git's back? Let's find out - and watch Flux refuse to let it stand."

→ Mission 05 unlocked.
