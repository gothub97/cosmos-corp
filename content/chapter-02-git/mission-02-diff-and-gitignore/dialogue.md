# What changed, and what to ignore

**Sage** taps a sticky note on the side of your monitor.

> "Two things people get wrong on day one: they commit *too much* (build
> artefacts, .env files, IDE junk), and they commit *without checking what
> they actually changed*. Today we fix both.
>
> I left you `~/work/repo` with one commit and three problems:
>
> 1. I edited `notes.md` to fix a typo. Look at exactly what I changed.
> 2. There's a `secrets.env` and a `build/output.log` in there that should
>    *never* be committed. Tell git to ignore them.
> 3. Then commit my fix and your shiny new `.gitignore`.
>
> The `secrets.env` thing is real - committing tokens to a public repo is
> how careers get… interesting. The earlier you build the habit of a clean
> `.gitignore`, the better."

---

You start in `~/work/repo`. Note that you don't need a text editor for the
.gitignore - `echo` and `>` will do (you've seen those in Chapter 1).
