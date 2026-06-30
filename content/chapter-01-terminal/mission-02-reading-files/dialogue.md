# Reading files

**Sage** drops a Slack message:

> "I left a build log in `welcome/manifest.log` - yesterday's CI run.
> It's 80-something lines, which is too much for `cat` but perfect for
> getting friendly with `head`, `tail`, and `less`.
>
> Four little commands today:
> 1. Print the README so you've actually read it.
> 2. Just the first few lines of the build log.
> 3. Just the last few - that's where the interesting stuff usually lives.
> 4. Open the whole log in a pager so you can scroll through it.
>
> Don't worry about *which* lines - pick any reasonable count."

---

When `less` opens, it takes over the screen. **Press `q`** to come back to
your prompt. (Arrow keys / space / `g` / `G` move around once you're inside.)
