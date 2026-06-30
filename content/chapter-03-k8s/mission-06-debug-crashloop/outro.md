# Red → amber → green

**Sage** leans back, satisfied.

> "*That* is the loop. You read the events, you understood what kubelet was
> complaining about, you patched the resource, and the controller did the
> rest. Same shape on a five-node cluster, same shape on a five-thousand-node
> cluster.
>
> Three habits worth banking from this one:
>
> - When a pod is wrong, `describe` first. The Events block is more useful
>   than logs 80% of the time.
> - When a container is crashing, `logs --previous` reads the *previous*
>   attempt's stdout. That's where the panic message lives.
> - When you patch live, prefer `kubectl set image` or a YAML-then-apply over
>   `kubectl edit`. Your fix should be reproducible - copy-pasting from
>   memory at 2am is not.
>
> That's Chapter 3. You've used every command on the kubectl bingo card. Now
> get some rest - Chapter 4 is GitOps, and it's wild."

→ Chapter 3 complete.
