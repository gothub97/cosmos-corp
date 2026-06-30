# Tidying messy history with rebase -i

**Sage** slides over a chunk of intentionally-bad git history.

> "I left a branch called `feature/onboarding` with three commits on it,
> and they're a mess: `wip`, `more wip`, `fix typo`. That's fine while
> you're working - but before sharing, we want *one* clean commit that
> tells the story.
>
> The tool for this is `git rebase -i`. The `-i` is *interactive*: git
> opens an editor with one line per commit and you tell it what to do with
> each one. Change a couple of `pick`s to `squash`, save, and git melds
> them into one commit (and lets you write a better message).
>
> Two editor sessions, no scary commands, totally reversible. Let's go."

---

You start on `main`. Switch to the feature branch first, then:

```
git rebase -i HEAD~3
```

In the nano editor, change the **second and third** `pick` to `squash`
(or `s`), save (Ctrl-O, Enter, Ctrl-X). A second editor opens for the new
commit message - make it something nice, save again, and you're done.

If anything feels weird, `git rebase --abort` rewinds to before the rebase
started.
