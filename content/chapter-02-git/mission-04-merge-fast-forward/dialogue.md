# Merging: glue the work back

**Sage** grabs the whiteboard pen.

> "When two branches have done their thing, you join them with `git merge`.
> There are two flavours and it matters which one happens:
>
> **Fast-forward** - the receiving branch hasn't moved since the side
> branch split off. Git just slides the label forward. No new commit, no
> drama. *(Like topic/banner → main below.)*
>
> **Three-way merge** - both branches have moved. Git creates a brand-new
> *merge commit* with two parents that stitches the histories together.
> *(Like topic/footer → main below.)*
>
> I set up two side branches for you. One will fast-forward. The other
> won't. You'll feel the difference."

---

```
topic/footer  o
             /
main        o---o    (your starting point - main has its own new commit)
             \
topic/banner  o---o  (two commits ahead, no main commits since the split)
```

Switch to `main`, then run two `git merge`s - one per branch - and look at
`git log --oneline --graph --all` afterwards.
