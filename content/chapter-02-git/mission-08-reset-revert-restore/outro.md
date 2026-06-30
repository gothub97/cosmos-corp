# The right tool for the right undo

**Sage** taps the table.

> "Memorise the table. Genuinely. The number of git messes I've seen come
> from someone reaching for `reset --hard` when they meant `restore`, or
> rewriting shared history when they should have used `revert`, is high.
>
> One last note: there's also `git reflog` - a log of *every* place HEAD
> has ever pointed. Even if you `reset --hard` something away, reflog
> usually still has the SHA, so you can `git reset --hard <that-SHA>` to
> get it back. Worth knowing exists; we'll skip the demo."

→ Mission 09 unlocked.
