# Pods - the smallest moving part

**Sage** drags up the cluster view.

> "Empty cluster, empty viz. Let's fix that. The smallest thing Kubernetes
> runs is a *Pod* - one or more containers that share a network namespace,
> scheduled together onto a single node.
>
> We're going to walk a pod through its full life cycle:
>
> 1. **Run** one - give it a name and an image, that's it.
> 2. **List** what's running, just to see the cluster admit it exists.
> 3. **Describe** it - the verbose, human-readable dump.
> 4. **Read its logs** - every container's stdout streams to here.
> 5. **Delete** it. Watch it disappear from the cluster view.
>
> Five commands. Same five you'll run a thousand times next year."

---

The cluster view up top will paint a node as soon as the pod is scheduled,
turn green when the container is ready, and fade out when you delete it.
