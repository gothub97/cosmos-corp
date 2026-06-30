# Two services, one workload

**Sage** circles the cluster view with a finger.

> "Notice the edges - both Services point at the same pods. That's the
> selector at work: anything matching `app=web` is fair game for traffic
> through either Service.
>
> Real-world, you'd often have *one* internal ClusterIP for service-to-service
> calls and *one* external entry point - usually a LoadBalancer or an
> Ingress in front of a ClusterIP. NodePort is the simplest external path
> and a fine debugging tool, but you don't see it much in production.
>
> Next: how to give those pods *configuration* without baking secrets into
> the image. ConfigMaps and Secrets."

→ Mission 05 unlocked.
