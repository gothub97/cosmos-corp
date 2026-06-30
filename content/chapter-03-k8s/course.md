# Chapter 3: The Cluster - Kubernetes

*A course by Sage*

---

> "A cluster is just a fleet of computers you talk to with one CLI. The clever
> part is what happens after you talk to it."

That's the one-sentence version. Here's the longer one, with enough detail that
you'll be able to reason about what the cluster is actually doing when you run a
command - not just memorize which flags to type.

---

## Why Kubernetes Exists

You have a container. It runs your app. You want three copies of it for
redundancy. One of them crashes at 3 AM. You want it to come back without waking
anyone up. You want to update all three to a new image without downtime. You want
other services inside the cluster to be able to reach them by a stable name,
regardless of which specific container is alive at any given moment.

You *could* hand-maintain all of this. People did, for years. It was worse.

Kubernetes is the answer to "I want my desired end-state to be a fact, and I
want the platform to close the gap automatically." Write down what you want;
Kubernetes makes it real, keeps it real, and repairs it when reality drifts.

---

## The Core Mental Model: Desired State vs. Observed State

This is the most important concept in Kubernetes. Everything else is a
variation of it. Read it twice.

**Desired state** is what you declare - "I want three replicas of this
container, running this image, with these environment variables." You write that
down in a YAML file and hand it to the cluster.

**Observed state** is what the cluster has actually managed to create right now
- the Pods that are running, the replicas that are alive, the volumes that are
mounted.

**Reconciliation** is the continuous process of closing the gap between the two.
Kubernetes never asks "what did I do last time?" It only asks "what does the
user want, and how does that differ from what exists?"

The official docs put it this way:

> "In Kubernetes, controllers are control loops that watch the state of your
> cluster, then make or request changes where needed. Each controller tries to
> move the current cluster state closer to the desired state."
>
> - [Kubernetes: Controllers](https://kubernetes.io/docs/concepts/architecture/controller/)

The docs use a thermostat as the analogy. You set the desired temperature; the
thermostat continuously checks the actual temperature and switches equipment on
or off to close the gap. Kubernetes is a thermostat for your workloads - except
instead of one thermostat, there are dozens of specialized ones (controllers),
each watching a different kind of object, each running its own loop.

This pattern is called a **control loop** or a **reconciliation loop**. You will
hear both terms constantly. They mean the same thing.

### Why this matters for Chapter 4

When we get to Flux (Chapter 4), you'll see the exact same pattern applied one
level up: Flux watches a Git repository, compares it to what's deployed in the
cluster, and reconciles any difference. Understanding Kubernetes control loops
*is* understanding Flux. It's turtles all the way down.

---

## The Architecture: API Server, etcd, and kubectl

Before we talk about Pods and Deployments, you need a mental picture of the
machinery underneath.

```
You
 │
 │  kubectl apply -f deployment.yaml
 ▼
API Server  ──── writes ────▶  etcd (cluster database)
     │                              │
     │  notifies                    │  controllers watch
     ▼                              ▼
Controllers ◀──── read current state ────
     │
     │  issue instructions
     ▼
Scheduler / kubelet / other control-plane components
     │
     │  actually run
     ▼
Pods on Nodes
```

**The API Server** is the front door to everything. Every `kubectl` command,
every controller, every piece of cluster automation goes through it. It validates
what you send, stores it in etcd, and broadcasts that something changed.

**etcd** is a distributed key-value store - the cluster's persistent memory. It
holds the authoritative record of every object: every Deployment spec you've
applied, every Pod that exists, every Service. If etcd is lost without a backup,
the cluster is lost. Treat it accordingly.

**kubectl** is a client. It does not run anything. It translates your commands
into API requests, sends them to the API server, and displays what comes back.
When you type `kubectl get pods`, you are querying the API server's view of the
cluster, not directly asking the nodes what's running.

**Controllers** are processes (bundled into `kube-controller-manager` for the
built-in ones) that run reconciliation loops. Each controller watches specific
kinds of objects and takes actions when observed state diverges from desired
state. The Deployment controller watches Deployment objects. The ReplicaSet
controller watches ReplicaSets. The Job controller watches Jobs. They don't
interfere with each other; they use labels and owner references to know which
objects are theirs.

The important point: **you describe objects; controllers make them real**. You
never directly tell a node "run this container." You tell the API server "I want
this Deployment to exist," and the machinery downstream figures out the rest.

---

## Pods: The Smallest Unit

A **Pod** is the smallest deployable unit in Kubernetes. Not a container - a
Pod. The distinction matters.

From the official docs:

> "A Pod (as in a pod of whales or pea pod) is a group of one or more
> containers, with shared storage and network resources, and a specification for
> how to run the containers. A Pod's contents are always co-located and
> co-scheduled, and run in a shared context."
>
> - [Kubernetes: Pods](https://kubernetes.io/docs/concepts/workloads/pods/)

Most of the time, a Pod contains exactly one container. The multi-container case
(a main app + a sidecar for logging or proxying) exists and is useful, but you'll
mostly deal with one container per Pod.

### What "shared context" means in practice

Containers in the same Pod share:

- **Network namespace** - they see the same IP address and the same loopback
  interface. Container A in a Pod can reach container B via `localhost`.
- **Storage volumes** - volumes defined on the Pod can be mounted by any
  container in that Pod.

They do *not* share process namespaces by default, though that can be enabled.

### Pods are ephemeral

This is not a performance characteristic. It is a design principle. Pods are
intended to be disposable. They can be evicted (node runs low on resources),
killed (node fails), or deleted. When that happens, the Pod is gone - its local
filesystem, its process state, its memory. Nothing is preserved.

This is why you almost never create bare Pods directly in production. You use a
controller (Deployment, StatefulSet, Job) that will recreate the Pod when it
disappears.

A minimal Pod manifest looks like this:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx
spec:
  containers:
  - name: nginx
    image: nginx:1.14.2
    ports:
    - containerPort: 80
```

You create it with `kubectl apply -f pod.yaml` or the shorthand
`kubectl run nginx --image=nginx`. Either way, the API server records it, the
scheduler assigns it to a node, and the kubelet on that node pulls the image and
starts the container.

### Reading a Pod's state

```bash
kubectl get pods                    # quick status view
kubectl describe pod nginx          # full event log and conditions
kubectl logs nginx                  # stdout from the container
kubectl logs nginx --previous       # logs from the previous (crashed) container
```

The `describe` output's **Events** section is where debugging starts. Every time
the scheduler placed the Pod, every time the kubelet pulled an image, every time
a container started or failed - it shows up there in a timestamped log.

> **Note:** Restarting a container in a Pod is not the same as restarting the
> Pod. If a container crashes, the kubelet restarts it (per the Pod's
> `restartPolicy`) without creating a new Pod. The Pod object persists; only the
> container process cycles.

---

## ReplicaSets: Keeping the Count Right

A **ReplicaSet** is a controller whose job is to ensure exactly N copies of a
given Pod are running at all times. N is the `replicas` field you specify. The
ReplicaSet controller watches for Pods matching its selector and creates or
deletes them to reach the target count.

From the docs:

> "A ReplicaSet's purpose is to maintain a stable set of replica Pods running at
> any given time. As such, it is often used to guarantee the availability of a
> specified number of identical Pods."
>
> - [Kubernetes: ReplicaSet](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/)

The ReplicaSet identifies its Pods by label selectors - not by name, not by
creation time. If you have a Pod with the right labels sitting around
unowned (no `ownerReferences`), the ReplicaSet will adopt it. This is usually
surprising the first time you see it.

A minimal ReplicaSet manifest:

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: frontend
spec:
  replicas: 3
  selector:
    matchLabels:
      tier: frontend
  template:
    metadata:
      labels:
        tier: frontend
    spec:
      containers:
      - name: app
        image: nginx:1.14.2
```

If one of those three Pods dies, the ReplicaSet controller notices (observed
count: 2, desired count: 3) and creates a replacement. That's the reconciliation
loop doing its job.

**You will rarely write ReplicaSet manifests directly.** The reason is in the
next section.

---

## Deployments: How You Actually Run Things

A **Deployment** manages a ReplicaSet, which manages Pods. Three layers. You
only interact directly with the top one.

> "A Deployment provides declarative updates for Pods and ReplicaSets. You
> describe a desired state in a Deployment, and the Deployment Controller changes
> the actual state to the desired state at a controlled rate."
>
> - [Kubernetes: Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)

The Deployment adds capabilities that ReplicaSets alone do not have:

- **Rolling updates** - when you change the Pod template (e.g., update an image
  tag), the Deployment creates a new ReplicaSet with the new spec and
  incrementally scales it up while scaling the old one down. During the rollout,
  you have some old Pods and some new ones; traffic gradually shifts.
- **Rollback** - every update creates a new revision. You can roll back to any
  previous revision.
- **Pause and resume** - you can pause a rollout mid-flight, apply multiple
  fixes, then resume.

A standard Deployment manifest:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: web
        image: nginx:1.14.2
        ports:
        - containerPort: 80
```

The `selector.matchLabels` and `template.metadata.labels` must align - the
Deployment uses those labels to find the Pods it owns.

### What triggers a rollout?

Only changes to `.spec.template` trigger a rolling update. If you change
`.spec.replicas`, you scale - you do not roll. If you change image tags, labels
inside the template, environment variables, or resource limits - that triggers
a rollout.

### The three-layer chain in practice

When you run `kubectl create deployment web --image=nginx`:

1. The API server creates a Deployment object.
2. The Deployment controller sees it, creates a ReplicaSet.
3. The ReplicaSet controller sees it, creates Pods.
4. The scheduler assigns each Pod to a node.
5. The kubelet on each node pulls the image and starts the container.

You issued one command. Five distinct things happened, driven by four distinct
controllers. This is what "controllers make desired state real" looks like in
motion.

Useful commands:

```bash
kubectl get deployments                        # list Deployments
kubectl get replicasets                        # see the chain
kubectl rollout status deployment/web          # watch a rollout progress
kubectl rollout history deployment/web         # list revisions
kubectl rollout undo deployment/web            # revert to previous revision
kubectl scale deployment web --replicas=5      # adjust replica count
kubectl set image deployment/web web=nginx:alpine  # trigger a rollout
```

> **Caveat:** Never directly manage a ReplicaSet owned by a Deployment. If you
> scale or edit the ReplicaSet manually, the Deployment controller will promptly
> overwrite your change. The Deployment is the authoritative source of truth.

---

## Services: Stable Names for Ephemeral Pods

Pods are ephemeral. Every time one is replaced, it gets a new IP address. If
your frontend hard-codes the IP of your backend Pod, the first crash breaks
everything.

A **Service** solves this by providing a stable virtual IP and a DNS name that
always routes to the current set of healthy Pods matching a selector.

> "A Service is a method for exposing a network application that is running as
> one or more Pods in your cluster."
>
> - [Kubernetes: Service](https://kubernetes.io/docs/concepts/services-networking/service/)

### How it works

You define a selector on the Service:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-svc
spec:
  selector:
    app: web
  ports:
  - protocol: TCP
    port: 80
    targetPort: 80
```

The Service controller continuously watches for Pods with the label `app: web`.
It maintains a set of **EndpointSlices** - the current list of Pod IPs that
match. When a Pod dies and a replacement comes up with a new IP, the Service's
EndpointSlices update automatically. Clients talking to the Service IP
(`web-svc.default.svc.cluster.local` in DNS form) never need to know.

The Service gets a **ClusterIP** - a stable virtual IP inside the cluster -
assigned at creation time and never changed for the life of that Service object.

### Service types

| Type | What it does |
|------|--------------|
| `ClusterIP` | Default. Stable IP reachable only inside the cluster. |
| `NodePort` | Exposes the Service on a static port on every node's external IP. Useful for development and simple external access. |
| `LoadBalancer` | Provisions a cloud load balancer with an external IP. The production way to expose something to the internet. |
| `ExternalName` | DNS alias to an external hostname. Does not create a virtual IP. |

### DNS in practice

Inside the cluster, every Service is reachable at:

```
<service-name>.<namespace>.svc.cluster.local
```

A Pod in the `default` namespace talking to the `web-svc` Service can use
`web-svc.default.svc.cluster.local` or, if it's in the same namespace, just
`web-svc`. Kubernetes' internal DNS handles the resolution.

> **The key insight:** Services decouple consumers from producers. Your frontend
> talks to `backend-svc`. It does not care which Pods are alive, how many there
> are, or where they are scheduled. The Service absorbs all of that complexity.

---

## ConfigMaps: Decoupling Config from Images

The practice of baking configuration into a container image is a trap. You end
up with one image per environment, or you find yourself rebuilding every time a
config value changes. Kubernetes offers a cleaner path: externalize config into
a **ConfigMap** and inject it into Pods at runtime.

> ConfigMaps "allow you to decouple environment-specific configuration from your
> container images, so that your applications are easily portable."
>
> - [Kubernetes: ConfigMap](https://kubernetes.io/docs/concepts/configuration/configmap/)

A ConfigMap is just a key-value store:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  LOG_LEVEL: "debug"
  DATABASE_HOST: "postgres.default.svc.cluster.local"
  app.properties: |
    feature.x=true
    retry.limit=3
```

You consume it in a Pod three ways:

**1. Environment variables**

```yaml
env:
- name: LOG_LEVEL
  valueFrom:
    configMapKeyRef:
      name: app-config
      key: LOG_LEVEL
```

**2. Mounted as files**

```yaml
volumeMounts:
- name: config-vol
  mountPath: /etc/app
volumes:
- name: config-vol
  configMap:
    name: app-config
```

Each key becomes a file in `/etc/app/`. The file content is the value. This is
useful for handing entire config files to applications that read from the
filesystem.

**3. Command-line arguments** - reference ConfigMap values in the container's
`command` or `args` fields.

> **Caveat - environment variables are not live-updated.** If you change the
> ConfigMap and the container reads the value via an env var, the container does
> not see the change until it restarts. Volume mounts are updated automatically
> (with a short delay based on the kubelet's sync period), but env vars are
> frozen at Pod startup.

ConfigMaps have a **1 MiB size limit**. For larger config files, use a volume
backed by a proper store.

---

## Secrets: Config That Must Not Be Visible

Secrets are structurally similar to ConfigMaps but are designed for sensitive
values - passwords, API tokens, TLS certificates, SSH keys.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
type: Opaque
data:
  username: YWRtaW4=      # base64("admin")
  password: cGFzc3dvcmQ=  # base64("password")
```

You consume them the same way as ConfigMaps - env vars or volume mounts - but
with `secretKeyRef` instead of `configMapKeyRef`.

```yaml
env:
- name: DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: db-credentials
      key: password
```

> **This is the most important warning in this chapter:**
>
> **Kubernetes Secrets are base64-encoded, not encrypted.** Base64 is an encoding
> scheme, not a security measure. The raw value is trivially recoverable.
> Secrets are stored unencrypted in etcd by default. Anyone with API access can
> retrieve them with `kubectl get secret <name> -o yaml`.
>
> For production systems, you must:
> - Enable encryption at rest for etcd Secrets.
> - Restrict access via RBAC (principle of least privilege).
> - Consider an external secrets manager (HashiCorp Vault, AWS Secrets Manager,
>   Sealed Secrets) that stores the real credentials outside the cluster.
>
> - [Kubernetes: Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)

The Secrets/ConfigMaps split is a convention about intent, not a technical
security guarantee. Don't let the name "Secret" lull you into skipping the
RBAC and encryption-at-rest steps.

---

## Debugging: CrashLoopBackOff and the Event Log

At some point - probably soon - you will see a Pod in `CrashLoopBackOff` status.
This is not a catastrophe. It is a signal. Here is how to read it.

### What CrashLoopBackOff means

The container in the Pod started, exited (with a non-zero code, or was OOM-killed),
and Kubernetes restarted it. Then it crashed again. And again. The "BackOff"
part is exponential backoff between restart attempts: 10s, 20s, 40s, 80s...
up to a five-minute ceiling. The cluster is protecting itself from a tight
crash-restart loop consuming all node resources.

Common causes:

- **Bad image tag** - the image doesn't exist, pull fails, container never starts.
- **Application error on startup** - a misconfigured env var, missing Secret, bad
  command-line argument causes the process to exit immediately.
- **Missing dependency** - the app tries to connect to a database that isn't
  ready and exits rather than waiting.
- **OOM kill** - the container exceeded its memory limit.

### The debugging workflow

**Step 1: Describe the Pod.**

```bash
kubectl describe pod <pod-name>
```

Read the **Events:** section at the bottom. This is a timestamped log of
everything that has happened to the Pod: scheduling, image pulls, container
starts, kills. For a bad image tag, you will see `Failed to pull image` and
`ErrImagePull` here before the `CrashLoopBackOff` kicks in. For a startup
failure, you will see the container starting and immediately terminating.

You can also describe the Deployment:

```bash
kubectl describe deployment <name>
```

The Deployment's events show rollout activity - useful when a new image is
failing to roll out.

**Step 2: Check the logs.**

```bash
kubectl logs <pod-name>
kubectl logs <pod-name> --previous
```

If the container is crashing, `kubectl logs` shows the current (likely empty or
mid-crash) output. `--previous` shows the logs from the previous container run
- often the most useful output, because it captures whatever the app printed
before it died.

**Step 3: Fix the root cause and watch the reconciliation loop close the gap.**

```bash
kubectl set image deployment/<name> <container>=<new-image>
# or
kubectl edit deployment/<name>
```

After the fix, watch the cluster paint the Pod from red to amber to green. That
is the reconciliation loop doing exactly what it was designed to do.

### `kubectl describe` is always step one

Every Kubernetes debugging workflow starts with `describe`. The Events section
tells you what actually happened; the rest of the output tells you what state
the object is in right now. Get comfortable reading it.

---

## How This Connects to the Six Missions

Each mission in this chapter gives you hands-on practice with one layer of the
stack:

| Mission | Concept in practice |
|---------|---------------------|
| 1 - First look | `kubectl` basics: talking to the cluster, reading nodes. |
| 2 - Pods | Pod lifecycle end to end: create, inspect, log, delete. |
| 3 - Deployments & ReplicaSets | The three-layer chain; scaling; rolling updates. |
| 4 - Services | Exposing a Deployment; stable DNS; ClusterIP in action. |
| 5 - ConfigMaps & Secrets | Decoupling config; consuming values in Pods. |
| 6 - Debug CrashLoopBackOff | `describe` + Events; `logs --previous`; fix and watch. |

The order is deliberate. You cannot understand Services without Pods. You cannot
debug a CrashLoop without knowing what a Deployment and its events look like. By
the time you reach Mission 6, you will have touched every layer in the stack.

---

## Common Pitfalls

**Label mismatch between Deployment selector and Pod template.** The cluster
will create the Deployment but it will never manage any Pods - they will never
satisfy the selector. Always double-check that `selector.matchLabels` appears
verbatim in `template.metadata.labels`.

**Editing a ReplicaSet owned by a Deployment.** The Deployment controller will
immediately overwrite the change. If you want to change the Pod spec, change the
Deployment.

**Forgetting that env vars from ConfigMaps are static.** Changed ConfigMap,
scratching your head why the app still reads the old value - the Pod never
restarted. Either restart it manually or switch to a volume mount if you need
live updates.

**Treating base64-encoded Secrets as encrypted.** They are not. Run
`kubectl get secret <name> -o jsonpath='{.data.password}' | base64 --decode`
and the plaintext is right there. Plan your RBAC accordingly.

**No `--previous` flag when the container is already restarting.** The current
container run often has empty logs (it crashed before printing anything).
`--previous` is what you actually want.

**Overlapping label selectors across Deployments.** If two Deployments use the
same labels, their ReplicaSet controllers will fight over the same Pods. Use
labels that are unique to each workload.

---

## Further Reading - Official Docs

These are the primary sources used for this chapter. When something in the
cluster behaves unexpectedly, these are the right places to go first.

- [Kubernetes Concepts overview](https://kubernetes.io/docs/concepts/)
- [Pods](https://kubernetes.io/docs/concepts/workloads/pods/)
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [ReplicaSets](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/)
- [Service](https://kubernetes.io/docs/concepts/services-networking/service/)
- [ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)
- [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- [Controllers](https://kubernetes.io/docs/concepts/architecture/controller/)
- [Good practices for Kubernetes Secrets](https://kubernetes.io/docs/concepts/security/secrets-good-practices/)
