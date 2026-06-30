# Plumbing

**Sage** types a quick demo on the shared screen.

```
$ ls /etc | head -3
adduser.conf
alternatives
apt
```

> "That `|` is a *pipe*. It glues two commands together: the left side's
> output becomes the right side's input. Once you see how powerful that is,
> you basically can't go back.
>
> The other two players today are `>` and `>>`:
>
> - `>` redirects output **into a file** (overwriting it).
> - `>>` redirects output **into a file** (appending).
>
> I dropped a tiny CSV at `~/work/orders.csv` and a fresh `app.log`.
> Time to mix all three."
