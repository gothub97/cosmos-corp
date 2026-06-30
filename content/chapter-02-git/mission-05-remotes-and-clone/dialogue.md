# Remotes: sharing the repo

**Sage** points at a server icon scribbled on the whiteboard.

> "So far everything's been on your laptop. Real teams have *somewhere
> else* - GitHub, GitLab, a self-hosted server - that's the canonical
> source of truth. We call those *remotes*.
>
> The dance is always the same:
>
> 1. **Clone** the remote repo to your laptop.
> 2. Work locally - branches, commits, the usual.
> 3. **Push** your branch back up so others see it.
> 4. **Fetch** to learn about new commits on the remote.
> 5. **Pull** to *download and merge* in one step.
>
> We've got a fake remote at `/srv/repos/cosmos.git` - same shape as a real
> server, just on the local filesystem. Treat it like GitHub for the next
> ten minutes."

---

The clone goes into `~/work/cosmos`. Once you're inside it, the rest is
ordinary commits + a `git push` at the end.
