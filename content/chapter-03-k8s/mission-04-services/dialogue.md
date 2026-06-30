# Services - giving pods an address

**Sage** drops a small whiteboard on your desk.

> "Pods are ephemeral. They die, get rescheduled, come back with a new IP.
> That's a problem if anything else in the cluster needs to *find* them.
>
> The solution is a **Service** - a stable virtual IP and DNS name that
> selects pods by their labels and load-balances across them. The pods can
> come and go; the Service stays put.
>
> Three things to do:
>
> 1. Expose your `web` Deployment as a **ClusterIP** Service. (Internal-only,
>    the default - the right call for east-west traffic.)
> 2. List Services to see your new one alongside the built-in `kubernetes`
>    Service.
> 3. Expose `web` *again* as a **NodePort** Service named `web-np`. Same
>    pods behind it; this time reachable from outside the cluster too.
>
> The cluster view will draw an edge from each Service to the pods it selects.
> That's the load-balancer in action."

---

`kubectl expose` is one of the highest-value verbs in your toolbox. Use it twice today.
