# Deployments - durable workloads

**Sage** stretches.

> "Bare pods are fine for poking around but in production you want something
> that *brings the pod back* when it dies. That's a **Deployment**.
>
> A Deployment doesn't run pods directly - it creates a **ReplicaSet**, and
> the ReplicaSet creates the pods. Three layers, one chain of ownership.
> The cluster view will draw the whole chain for you with arrows.
>
> Three things to do:
>
> 1. Create a Deployment called `web` from the nginx image.
> 2. List Deployments and ReplicaSets to see the chain.
> 3. Scale it from 1 replica to 3 - and watch the new pods light up live."

---

The viz is going to get busy. That's the point.
