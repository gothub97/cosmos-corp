# When two people edit the same line

**Sage** sits down properly this time.

> "OK - this one is the moment people start trusting git. I've cloned a
> different repo for you (`~/work/cosmos-conflicts`) and pre-edited
> `manifest.txt` to add a new pilot called Storm. Looks innocent.
>
> *But* - while you weren't looking, someone else (me, basically) already
> pushed a commit that adds a different pilot, Captain Q, on the same line.
> So when you commit your change and push it, git is going to refuse:
>
>     ! [rejected]   main -> main (fetch first)
>
> That message is git saying: *'I won't let you destroy their work to
> publish yours.'* The right move is to bring their commit down with
> `git pull`, resolve the conflict (merge by hand), and push the merged
> result.
>
> The first conflict you ever resolve is the scariest. After this, they're
> annoying but boring. Let's go."

---

You're already in `~/work/cosmos-conflicts` with your local edit waiting.
Commit, push, watch it bounce, then pull and finish the merge.
