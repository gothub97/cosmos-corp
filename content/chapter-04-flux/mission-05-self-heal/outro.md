# The cluster can't drift away from git

**Sage** watches the third pod snap back into place.

> "You knocked it down to one and Flux put it right back to three - because
> three is what the repo says, and the repo wins. You didn't fix it. The
> system fixed itself.
>
> That's the property that makes GitOps trustworthy. Configuration drift -
> the slow accumulation of undocumented hand-tweaks that makes 'works on the
> old cluster' a nightmare - just can't happen here. Every reconcile drags
> reality back to the declared state. The only way to make a *lasting* change
> is to change git. Try to shortcut it with `kubectl`, and Flux quietly
> overrules you.
>
> One thing left. So far everything you pushed was *valid*. But real engineers
> push mistakes - a typo, a bad image tag - and Flux goes red. In the finale
> you'll do exactly that, learn to read the failure, and fix it the GitOps
> way: another commit. Let's break it on purpose."

→ Mission 06 unlocked.
