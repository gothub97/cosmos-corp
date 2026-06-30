# Undoing things: reset vs revert vs restore

**Sage** writes three words on the board and circles each one.

> "Three commands, three undo strategies, all confusingly similar names.
> The trick is to ask **what are you undoing?**
>
> | If you want to undo… | Use…       | What it touches            |
> |----------------------|------------|----------------------------|
> | a working-tree edit  | `restore`  | The file on disk           |
> | a stage (a `git add`)| `reset` (or `restore --staged`) | The staging area only |
> | a *committed* change | `revert`   | History - by adding a new commit |
>
> The big rule: **never `reset --hard` a commit you've pushed**, because
> you'd be rewriting public history. Use `revert` for that - it makes a
> new commit that undoes the bad one without erasing it.
>
> I left you a small mess. One of each. Fix them in any order."

---

The mess in `~/work/repo`:

- `notes.md` - modified in the working tree, but you don't want the change.
- `scratch.txt` - staged, but it shouldn't be in the next commit.
- A committed `Typo: capatin` (sic) commit on main that needs to disappear
  *publicly*.

Three commands, three problems.
