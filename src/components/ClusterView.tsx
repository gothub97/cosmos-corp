/**
 * ClusterView - live React Flow visualization of the Kubernetes cluster.
 *
 * Subscribes to `cluster-updated` events on the engine and re-renders the
 * graph whenever the Rust watcher pushes a new snapshot. The initial paint
 * comes from `engine.getClusterSnapshot()` so the graph isn't blank during
 * the watcher's first poll cycle.
 *
 * Visuals:
 *   - One column per namespace, with a subtle group container.
 *   - Workloads (Deployment / ReplicaSet / Pod) stack vertically.
 *   - Services sit alongside the workload column they target.
 *   - ConfigMaps render as small chips at the bottom of the namespace.
 *   - Cluster-scoped kinds (Node, Namespace itself) live in a dedicated
 *     "cluster" column on the far left.
 *
 * Edges:
 *   - Solid phosphor for ownership (Deployment → ReplicaSet → Pod via ownerRefs).
 *   - Dashed amber for selector matches (Service → Pods whose labels match).
 *
 * Animation:
 *   - Newly-added uids fade-in via `motion-safe:` opacity transitions.
 *   - Removed uids fade-out: kept on screen for ~280ms with `data-leaving`
 *     before being dropped from the React Flow node array.
 *   - Status transitions trigger a brief ring-pulse on the affected node.
 *   - prefers-reduced-motion suppresses all animations (CSS-driven).
 *
 * Click a node → `onInspect(resource)` so MissionScene can open InspectPanel.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type {
  ClusterSnapshot,
  ClusterViewSpec,
  K8sKind,
  K8sResource,
} from "../ipc/contract";
import { engine } from "../game/engine";

// ─── Public API ──────────────────────────────────────────────────────────────

export interface ClusterViewProps {
  /** The watcher's spec - passed through to the initial snapshot fetch only.
   *  The Rust side already runs the watcher with this spec when the mission
   *  started, so live updates flow regardless of what we pass here. */
  spec?: ClusterViewSpec;
  /** Called when the player clicks a node. */
  onInspect?: (resource: K8sResource) => void;
  className?: string;
}

// ─── Status normalization → Tailwind tokens ─────────────────────────────────

type StatusTier = "ok" | "warn" | "bad" | "muted";

function statusTier(status: string | undefined): StatusTier {
  if (!status) return "muted";
  switch (status) {
    case "Running":
    case "Ready":
      return "ok";
    case "Pending":
    case "NotReady":
    case "Reconciling":
      return "warn";
    case "Failed":
    case "CrashLoopBackOff":
    case "Stalled":
      return "bad";
    case "Succeeded":
    case "Terminating":
    case "Suspended":
      return "muted";
    default:
      return "muted";
  }
}

const TIER_PILL: Record<StatusTier, string> = {
  ok: "border-phosphor-600/60 bg-phosphor-500/15 text-phosphor-200",
  warn: "border-amber-cursor/50 bg-amber-cursor/15 text-amber-cursor",
  bad: "border-danger/50 bg-danger/15 text-danger",
  muted: "border-cosmos-border bg-cosmos-panel-2/40 text-cosmos-muted",
};

const TIER_RING: Record<StatusTier, string> = {
  ok: "ring-phosphor-400/60",
  warn: "ring-amber-cursor/60",
  bad: "ring-danger/60",
  muted: "ring-cosmos-border",
};

// ─── Layout constants ────────────────────────────────────────────────────────
// Card sizes are duplicated as Tailwind utilities on the rendered components
// AND as numbers here so React Flow can size the viewport correctly *before*
// the DOM measures the real width. Keeping them in lock-step is the price
// of avoiding fitView clipping with custom nodes.

const CARD_WIDTH = 240;
const CARD_HEIGHT = 76;
const CHIP_WIDTH = 200;
const CHIP_HEIGHT = 36;

const ROW_GAP = 16;
const COL_GAP = 16;
const NS_PADDING_TOP = 44;
const NS_PADDING_X = 16;
const NS_PADDING_BOTTOM = 16;
const NS_GUTTER = 32;
/** Minimum namespace box width so empty namespaces still look like containers. */
const NS_MIN_WIDTH = CARD_WIDTH + NS_PADDING_X * 2;

// Per-kind row "tier" - vertical bands within each namespace.
// Flux CRDs (gitrepository, kustomization) occupy the top two rows so the
// GitOps reconcile chain reads top-to-bottom: GitRepository → Kustomization →
// Deployment → ReplicaSet → Pod. Rows shifted down by 2 from the original
// because the layout math requires non-negative row indices.
const KIND_ROW: Record<K8sKind, number> = {
  namespace: 2, // unused - namespaces render as group containers
  node: 2,
  gitrepository: 0,
  kustomization: 1,
  deployment: 2,
  replicaset: 3,
  pod: 4,
  service: 5,
  configmap: 6,
  secret: 6,
};

const TIER_KIND: Record<number, "card" | "chip"> = {
  0: "card", // gitrepository
  1: "card", // kustomization
  2: "card", // deployment, node
  3: "card", // replicaset
  4: "card", // pod
  5: "card", // service
  6: "chip", // configmap, secret
};

// ─── Custom node data ────────────────────────────────────────────────────────

interface BaseNodeData extends Record<string, unknown> {
  resource: K8sResource;
  /** Set true while the node is fading out so the component can apply a
   *  data-leaving attribute / opacity-0 in motion-safe contexts. */
  leaving?: boolean;
  /** Set true for a brief window after a status transition - drives the
   *  ring-pulse animation in the kind-shell. */
  pulse?: boolean;
}

interface NamespaceNodeData extends Record<string, unknown> {
  name: string;
}

type CosmosNode =
  | (Node<NamespaceNodeData> & { type: "namespace" })
  | (Node<BaseNodeData> & {
      type:
        | "deployment"
        | "replicaset"
        | "pod"
        | "service"
        | "configmap"
        | "node-resource"
        | "gitrepository"
        | "kustomization";
    });

// ─── Sub-components: kind-specific node renderers ────────────────────────────

function StatusPill({ status }: { status: string | undefined }) {
  const tier = statusTier(status);
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide " +
        TIER_PILL[tier]
      }
    >
      <span
        aria-hidden="true"
        className={
          "h-1.5 w-1.5 rounded-full " +
          (tier === "ok"
            ? "bg-phosphor-400 motion-safe:animate-pulse"
            : tier === "warn"
              ? "bg-amber-cursor motion-safe:animate-pulse"
              : tier === "bad"
                ? "bg-danger motion-safe:animate-pulse"
                : "bg-cosmos-muted")
        }
      />
      {status ?? "-"}
    </span>
  );
}

interface KindShellProps {
  resource: K8sResource;
  icon: string;
  kindLabel: string;
  leaving?: boolean;
  /** True for one render after a status transition - pulses the ring. */
  pulse?: boolean;
  children?: React.ReactNode;
}

function KindShell({ resource, icon, kindLabel, leaving, pulse, children }: KindShellProps) {
  const tier = statusTier(resource.status);
  return (
    <div
      data-leaving={leaving ? "true" : undefined}
      className={
        "flex w-[240px] flex-col gap-1 rounded-md border border-cosmos-border " +
        "bg-cosmos-panel/90 px-2.5 py-2 shadow-sm backdrop-blur-sm " +
        "transition-opacity duration-200 ease-out " +
        "motion-safe:data-[leaving=true]:opacity-0 " +
        (pulse ? "ring-2 " + TIER_RING[tier] + " motion-safe:animate-pulse " : "")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="text-base text-phosphor-400">
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-widest text-cosmos-muted">
              {kindLabel}
            </p>
            <p className="truncate font-mono text-xs text-cosmos-text" title={resource.name}>
              {resource.name}
            </p>
          </div>
        </div>
        <StatusPill status={resource.status} />
      </div>
      {children && <div className="text-[10px] text-cosmos-muted">{children}</div>}
    </div>
  );
}

const NamespaceNode = memo(function NamespaceNode({
  data,
}: NodeProps<Node<NamespaceNodeData> & { type: "namespace" }>) {
  return (
    <div className="pointer-events-none flex h-full w-full flex-col rounded-xl border border-dashed border-cosmos-border/70 bg-cosmos-panel-2/20 px-3 pt-2">
      <p className="text-[10px] uppercase tracking-widest text-phosphor-400">
        ns / <span className="font-mono normal-case text-cosmos-text">{data.name}</span>
      </p>
    </div>
  );
});

const DeploymentNode = memo(function DeploymentNode({
  data,
}: NodeProps<Node<BaseNodeData> & { type: "deployment" }>) {
  const r = data.resource;
  const replicas = r.replicas;
  return (
    <KindShell
      resource={r}
      icon="❑"
      kindLabel="Deployment"
      leaving={data.leaving}
      pulse={data.pulse}
    >
      {replicas
        ? `${replicas.ready}/${replicas.desired} ready · ${replicas.available} available`
        : "no replica info"}
    </KindShell>
  );
});

const ReplicaSetNode = memo(function ReplicaSetNode({
  data,
}: NodeProps<Node<BaseNodeData> & { type: "replicaset" }>) {
  const r = data.resource;
  const replicas = r.replicas;
  return (
    <KindShell
      resource={r}
      icon="◫"
      kindLabel="ReplicaSet"
      leaving={data.leaving}
      pulse={data.pulse}
    >
      {replicas ? `${replicas.ready}/${replicas.desired} ready` : "-"}
    </KindShell>
  );
});

const PodNode = memo(function PodNode({
  data,
}: NodeProps<Node<BaseNodeData> & { type: "pod" }>) {
  const r = data.resource;
  const restarts = r.containerStatuses?.reduce((n, c) => n + c.restartCount, 0);
  // Surface the *reason* a container is stuck - for ImagePullBackOff,
  // CrashLoopBackOff, or any other waiting/terminated state, the resource-level
  // `status` only normalizes to a coarse tier (Pending / Failed). The actual
  // reason lives in `containerStatuses[*].state` as e.g. "waiting:ImagePullBackOff"
  // or "terminated:Error". Pull the first non-running one so the player can see
  // at a glance why a pod is yellow/red without opening the InspectPanel.
  const stuck = r.containerStatuses?.find(
    (c) => c.state.startsWith("waiting:") || c.state.startsWith("terminated:"),
  );
  const stuckReason = stuck ? stuck.state.split(":")[1] : null;
  return (
    <KindShell
      resource={r}
      icon="◉"
      kindLabel="Pod"
      leaving={data.leaving}
      pulse={data.pulse}
    >
      {stuckReason ? (
        <span className="font-mono text-amber-cursor">{stuckReason}</span>
      ) : r.podIP ? (
        `ip ${r.podIP}`
      ) : (
        "no ip"
      )}
      {typeof restarts === "number" && restarts > 0
        ? `  ·  restarts: ${restarts}`
        : ""}
    </KindShell>
  );
});

const ServiceNode = memo(function ServiceNode({
  data,
}: NodeProps<Node<BaseNodeData> & { type: "service" }>) {
  const r = data.resource;
  const port = r.ports?.[0];
  return (
    <KindShell
      resource={r}
      icon="◈"
      kindLabel={`Service · ${r.serviceType ?? "ClusterIP"}`}
      leaving={data.leaving}
      pulse={data.pulse}
    >
      {port
        ? `:${port.port} → ${port.targetPort}${port.nodePort ? ` (node :${port.nodePort})` : ""}`
        : "no ports"}
    </KindShell>
  );
});

const ConfigMapNode = memo(function ConfigMapNode({
  data,
}: NodeProps<Node<BaseNodeData> & { type: "configmap" }>) {
  const r = data.resource;
  return (
    <div
      data-leaving={data.leaving ? "true" : undefined}
      className={
        "flex w-[200px] items-center gap-2 rounded-full border border-cosmos-border " +
        "bg-cosmos-panel-2/70 px-3 py-1.5 text-[10px] text-cosmos-text " +
        "transition-opacity duration-200 ease-out motion-safe:data-[leaving=true]:opacity-0"
      }
    >
      <span aria-hidden="true" className="text-phosphor-400">
        ⌬
      </span>
      <span className="font-mono uppercase tracking-widest text-cosmos-muted text-[9px]">
        {r.kind === "secret" ? "secret" : "cm"}
      </span>
      <span className="truncate font-mono" title={r.name}>
        {r.name}
      </span>
    </div>
  );
});

const NodeResourceNode = memo(function NodeResourceNode({
  data,
}: NodeProps<Node<BaseNodeData> & { type: "node-resource" }>) {
  return (
    <KindShell
      resource={data.resource}
      icon="⬢"
      kindLabel="Node"
      leaving={data.leaving}
      pulse={data.pulse}
    >
      cluster-scoped
    </KindShell>
  );
});

const GitRepositoryNode = memo(function GitRepositoryNode({
  data,
}: NodeProps<Node<BaseNodeData> & { type: "gitrepository" }>) {
  const r = data.resource;
  return (
    <KindShell
      resource={r}
      icon="⎇"
      kindLabel="GitRepository"
      leaving={data.leaving}
      pulse={data.pulse}
    />
  );
});

const KustomizationNode = memo(function KustomizationNode({
  data,
}: NodeProps<Node<BaseNodeData> & { type: "kustomization" }>) {
  const r = data.resource;
  return (
    <KindShell
      resource={r}
      icon="⟳"
      kindLabel="Kustomization"
      leaving={data.leaving}
      pulse={data.pulse}
    >
      {r.sourceRef ? `← ${r.sourceRef}` : undefined}
    </KindShell>
  );
});

const NODE_TYPES: NodeTypes = {
  namespace: NamespaceNode,
  deployment: DeploymentNode,
  replicaset: ReplicaSetNode,
  pod: PodNode,
  service: ServiceNode,
  configmap: ConfigMapNode,
  "node-resource": NodeResourceNode,
  gitrepository: GitRepositoryNode,
  kustomization: KustomizationNode,
};

// ─── Layout ──────────────────────────────────────────────────────────────────

interface LaidOut {
  nodes: CosmosNode[];
  edges: Edge[];
}

const CLUSTER_COL = "__cluster__";

/** Group resources into namespaces (cluster-scoped → CLUSTER_COL). */
function groupByNamespace(
  resources: K8sResource[],
): Map<string, K8sResource[]> {
  const groups = new Map<string, K8sResource[]>();
  for (const r of resources) {
    const ns =
      r.kind === "namespace" || r.kind === "node" || !r.namespace
        ? CLUSTER_COL
        : r.namespace;
    let bucket = groups.get(ns);
    if (!bucket) {
      bucket = [];
      groups.set(ns, bucket);
    }
    bucket.push(r);
  }
  return groups;
}

function selectorMatches(
  selector: Record<string, string> | undefined,
  labels: Record<string, string> | undefined,
): boolean {
  if (!selector || Object.keys(selector).length === 0) return false;
  if (!labels) return false;
  for (const [k, v] of Object.entries(selector)) {
    if (labels[k] !== v) return false;
  }
  return true;
}

function nodeTypeForKind(kind: K8sKind): CosmosNode["type"] | null {
  switch (kind) {
    case "gitrepository":
      return "gitrepository";
    case "kustomization":
      return "kustomization";
    case "deployment":
      return "deployment";
    case "replicaset":
      return "replicaset";
    case "pod":
      return "pod";
    case "service":
      return "service";
    case "configmap":
    case "secret":
      return "configmap";
    case "node":
      return "node-resource";
    case "namespace":
      return null; // handled as group container
  }
}

function layout(
  snapshot: ClusterSnapshot,
  leavingUids: Set<string>,
  pulsingUids: Set<string>,
): LaidOut {
  const all = Object.values(snapshot.resources);
  const groups = groupByNamespace(all);
  const namespaces = [...groups.keys()].sort((a, b) => {
    if (a === CLUSTER_COL) return -1;
    if (b === CLUSTER_COL) return 1;
    return a.localeCompare(b);
  });

  const nodes: CosmosNode[] = [];
  const edges: Edge[] = [];

  // Group items in each namespace by row, sorted by name for stable ordering.
  const itemsByNsRow = new Map<string, Map<number, K8sResource[]>>();
  for (const nsKey of namespaces) {
    const byRow = new Map<number, K8sResource[]>();
    const items = groups.get(nsKey) ?? [];
    for (const r of items) {
      const t = nodeTypeForKind(r.kind);
      if (!t) continue;
      const row = KIND_ROW[r.kind];
      let bucket = byRow.get(row);
      if (!bucket) {
        bucket = [];
        byRow.set(row, bucket);
      }
      bucket.push(r);
    }
    for (const bucket of byRow.values()) {
      bucket.sort((a, b) => a.name.localeCompare(b.name));
    }
    itemsByNsRow.set(nsKey, byRow);
  }

  // Compute per-namespace box width: the widest row's content + horizontal padding.
  const nsWidth = new Map<string, number>();
  const nsHeight = new Map<string, number>();
  for (const nsKey of namespaces) {
    const byRow = itemsByNsRow.get(nsKey) ?? new Map();
    let widest = 0;
    let maxRow = -1;
    for (const [row, bucket] of byRow.entries()) {
      const tier = TIER_KIND[row] ?? "card";
      const w = tier === "chip" ? CHIP_WIDTH : CARD_WIDTH;
      const rowWidth = bucket.length * w + (bucket.length - 1) * COL_GAP;
      if (rowWidth > widest) widest = rowWidth;
      if (row > maxRow) maxRow = row;
    }
    const innerWidth = Math.max(widest, CARD_WIDTH);
    nsWidth.set(nsKey, Math.max(NS_MIN_WIDTH, innerWidth + NS_PADDING_X * 2));
    // Height: title pad + (maxRow+1) tiers, each tier tall enough for a card.
    // Chip tier shrinks to chip height to keep the box tight.
    let height = NS_PADDING_TOP;
    for (let r = 0; r <= maxRow; r++) {
      const tier = TIER_KIND[r] ?? "card";
      const h = tier === "chip" ? CHIP_HEIGHT : CARD_HEIGHT;
      height += h;
      if (r < maxRow) height += ROW_GAP;
    }
    height += NS_PADDING_BOTTOM;
    // Empty namespace still gets a presence - show the title + a hint of body.
    nsHeight.set(nsKey, Math.max(height, NS_PADDING_TOP + CARD_HEIGHT + NS_PADDING_BOTTOM));
  }

  // Lay out namespaces left-to-right, each starting at the prior's right edge.
  let nextX = 0;
  for (const nsKey of namespaces) {
    const colX = nextX;
    const colW = nsWidth.get(nsKey) ?? NS_MIN_WIDTH;
    const colH = nsHeight.get(nsKey) ?? CARD_HEIGHT;
    nextX = colX + colW + NS_GUTTER;

    if (nsKey !== CLUSTER_COL) {
      nodes.push({
        id: `ns:${nsKey}`,
        type: "namespace",
        position: { x: colX, y: 0 },
        data: { name: nsKey },
        draggable: false,
        selectable: false,
        focusable: false,
        style: {
          width: colW,
          height: colH,
          zIndex: -1,
        },
      });
    }

    const byRow = itemsByNsRow.get(nsKey) ?? new Map();
    // Sweep rows in order so y-coordinates are deterministic.
    const rows = [...byRow.keys()].sort((a, b) => a - b);
    let yCursor = NS_PADDING_TOP;
    for (let r = 0; r <= (rows[rows.length - 1] ?? -1); r++) {
      const tier = TIER_KIND[r] ?? "card";
      const h = tier === "chip" ? CHIP_HEIGHT : CARD_HEIGHT;
      const w = tier === "chip" ? CHIP_WIDTH : CARD_WIDTH;
      const bucket: K8sResource[] = byRow.get(r) ?? [];
      // Center the row's content within the namespace inner width.
      const rowWidth = bucket.length > 0
        ? bucket.length * w + (bucket.length - 1) * COL_GAP
        : 0;
      const innerLeft = colX + NS_PADDING_X;
      const innerWidth = colW - NS_PADDING_X * 2;
      const startX = innerLeft + Math.max(0, (innerWidth - rowWidth) / 2);
      bucket.forEach((res: K8sResource, i: number) => {
        const t = nodeTypeForKind(res.kind);
        if (!t) return;
        const x = startX + i * (w + COL_GAP);
        const leaving = leavingUids.has(res.uid);
        const pulse = pulsingUids.has(res.uid);
        nodes.push({
          id: res.uid,
          type: t,
          position: { x, y: yCursor },
          data: { resource: res, leaving, ...(pulse ? { pulse: true } : {}) },
          draggable: false,
          // Telling React Flow the size up-front is critical: without it,
          // fitView measures placeholder dimensions, zooms in, and the real
          // 240px-wide cards then overflow the calculated viewport bounds.
          width: w,
          height: h,
          style: { width: w, height: h },
        } as CosmosNode);
      });
      yCursor += h;
      if (r < (rows[rows.length - 1] ?? -1)) yCursor += ROW_GAP;
    }
  }

  // Edges - ownership (solid).
  for (const r of all) {
    if (!r.ownerRefs) continue;
    for (const owner of r.ownerRefs) {
      // Only draw if owner is in the snapshot (otherwise edge dangles).
      if (!snapshot.resources[owner.uid]) continue;
      edges.push({
        id: `own:${owner.uid}->${r.uid}`,
        source: owner.uid,
        target: r.uid,
        type: "smoothstep",
        animated: false,
        style: { stroke: "var(--color-phosphor-500)", strokeWidth: 1.25, opacity: 0.7 },
      });
    }
  }

  // Edges - service routing (dashed amber).
  const podsByNs = new Map<string, K8sResource[]>();
  for (const r of all) {
    if (r.kind !== "pod") continue;
    const ns = r.namespace ?? "";
    let bucket = podsByNs.get(ns);
    if (!bucket) {
      bucket = [];
      podsByNs.set(ns, bucket);
    }
    bucket.push(r);
  }
  for (const r of all) {
    if (r.kind !== "service") continue;
    const ns = r.namespace ?? "";
    const candidates = podsByNs.get(ns) ?? [];
    for (const pod of candidates) {
      if (!selectorMatches(r.selector, pod.labels)) continue;
      edges.push({
        id: `svc:${r.uid}->${pod.uid}`,
        source: r.uid,
        target: pod.uid,
        type: "smoothstep",
        animated: true,
        style: {
          stroke: "var(--color-amber-cursor)",
          strokeWidth: 1,
          strokeDasharray: "4 4",
          opacity: 0.85,
        },
      });
    }
  }

  // Edges - Flux GitOps reconcile chain (animated dashed phosphor).
  // Kustomization → GitRepository: shows the source dependency.
  // Kustomization → Deployment: shows which workloads a Kustomization manages,
  //   detected via the kustomize.toolkit.fluxcd.io/name label on Deployments.
  const gitReposByName = new Map<string, K8sResource>();
  for (const r of all) {
    if (r.kind === "gitrepository") gitReposByName.set(r.name, r);
  }
  for (const r of all) {
    if (r.kind !== "kustomization") continue;
    // Kustomization → GitRepository
    if (r.sourceRef) {
      const repo = gitReposByName.get(r.sourceRef);
      if (repo) {
        edges.push({
          id: `flux:${r.uid}->${repo.uid}`,
          source: r.uid,
          target: repo.uid,
          type: "smoothstep",
          animated: true,
          style: {
            stroke: "var(--color-phosphor-500)",
            strokeWidth: 1.25,
            strokeDasharray: "6 3",
            opacity: 0.8,
          },
        });
      }
    }
    // Kustomization → Deployment (via label)
    for (const dep of all) {
      if (dep.kind !== "deployment") continue;
      if (dep.labels?.["kustomize.toolkit.fluxcd.io/name"] !== r.name) continue;
      edges.push({
        id: `flux:${r.uid}->${dep.uid}`,
        source: r.uid,
        target: dep.uid,
        type: "smoothstep",
        animated: true,
        style: {
          stroke: "var(--color-phosphor-500)",
          strokeWidth: 1.25,
          strokeDasharray: "6 3",
          opacity: 0.8,
        },
      });
    }
  }

  return { nodes, edges };
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-cosmos-border bg-cosmos-panel/70 px-6 py-5 text-center backdrop-blur-sm">
        <span
          aria-hidden="true"
          className="h-3 w-3 rounded-full bg-phosphor-400 motion-safe:animate-pulse"
        />
        <p className="font-mono text-xs uppercase tracking-widest text-phosphor-400">
          cluster idle
        </p>
        <p className="max-w-[260px] text-sm text-cosmos-text">
          Cluster is quiet. Apply something to see it light up.
        </p>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

function ClusterViewInner({ spec, onInspect, className }: ClusterViewProps) {
  const rf = useReactFlow();
  const [snapshot, setSnapshot] = useState<ClusterSnapshot>(() => ({
    resources: {},
    version: 0,
    sampledAt: new Date(0).toISOString(),
  }));

  // Track uids that have been removed in the latest tick - we keep them in
  // the rendered set for ~280ms with `leaving: true` so the fade-out plays
  // before React Flow drops them.
  const [leavingUids, setLeavingUids] = useState<Set<string>>(() => new Set());
  const [pulsingUids, setPulsingUids] = useState<Set<string>>(() => new Set());
  const lingeringRef = useRef<Map<string, K8sResource>>(new Map());
  const prevStatusRef = useRef<Map<string, string | undefined>>(new Map());

  // Initial paint via getClusterSnapshot. We send the spec as a one-shot hint;
  // the live watcher (if active) ignores it. Failures are logged but don't
  // block rendering - the empty state stays visible until the first real event.
  useEffect(() => {
    let cancelled = false;
    engine
      .getClusterSnapshot(spec)
      .then((snap) => {
        if (cancelled) return;
        setSnapshot(snap);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[ClusterView] initial snapshot failed:", err);
      });
    return () => {
      cancelled = true;
    };
    // We intentionally re-fetch when spec identity changes (mission swap).
  }, [spec]);

  // Subscribe to live updates from the engine.
  useEffect(() => {
    return engine.on("cluster-updated", ({ snapshot: snap }) => {
      setSnapshot((prev) => {
        // ── Detect removals: present in prev, absent in snap.
        const removed: K8sResource[] = [];
        for (const [uid, res] of Object.entries(prev.resources)) {
          if (!snap.resources[uid]) removed.push(res);
        }

        // Stash leaving resources so they keep rendering while fading.
        if (removed.length > 0) {
          for (const r of removed) lingeringRef.current.set(r.uid, r);
          setLeavingUids((prevSet) => {
            const next = new Set(prevSet);
            for (const r of removed) next.add(r.uid);
            return next;
          });
          // Drop them after the fade.
          window.setTimeout(() => {
            for (const r of removed) lingeringRef.current.delete(r.uid);
            setLeavingUids((prevSet) => {
              const next = new Set(prevSet);
              for (const r of removed) next.delete(r.uid);
              return next;
            });
          }, 280);
        }

        // ── Detect status transitions for ring-pulse.
        const transitioned: string[] = [];
        for (const [uid, res] of Object.entries(snap.resources)) {
          const prevStatus = prevStatusRef.current.get(uid);
          if (prevStatus !== undefined && prevStatus !== res.status) {
            transitioned.push(uid);
          }
          prevStatusRef.current.set(uid, res.status);
        }
        if (transitioned.length > 0) {
          setPulsingUids((prevSet) => {
            const next = new Set(prevSet);
            for (const uid of transitioned) next.add(uid);
            return next;
          });
          window.setTimeout(() => {
            setPulsingUids((prevSet) => {
              const next = new Set(prevSet);
              for (const uid of transitioned) next.delete(uid);
              return next;
            });
          }, 700);
        }

        return snap;
      });
    });
  }, []);

  // Compose the snapshot the layout actually sees: live + lingering (leaving) ones.
  const renderSnapshot = useMemo<ClusterSnapshot>(() => {
    if (leavingUids.size === 0) return snapshot;
    const merged: Record<string, K8sResource> = { ...snapshot.resources };
    for (const uid of leavingUids) {
      const r = lingeringRef.current.get(uid);
      if (r) merged[uid] = r;
    }
    return { ...snapshot, resources: merged };
  }, [snapshot, leavingUids]);

  const { nodes, edges } = useMemo(
    () => layout(renderSnapshot, leavingUids, pulsingUids),
    [renderSnapshot, leavingUids, pulsingUids],
  );

  // Re-fit the viewport whenever the set of resource UIDs changes. Without
  // this, fitView only runs on mount and the viewport stays anchored to the
  // initial (often empty) snapshot - new pods render off-screen.
  const uidsKey = useMemo(
    () => Object.keys(renderSnapshot.resources).sort().join("|"),
    [renderSnapshot.resources],
  );
  useEffect(() => {
    if (nodes.length === 0) return;
    // Defer to next tick so React Flow has measured the new nodes.
    const id = window.setTimeout(() => {
      try {
        rf.fitView({ padding: 0.15, maxZoom: 1.1, duration: 200 });
      } catch {
        // ReactFlow not yet mounted - safe to ignore.
      }
    }, 30);
    return () => window.clearTimeout(id);
    // We intentionally re-run on uidsKey rather than nodes - node array
    // identity flips on every snapshot tick (status changes etc.) but we
    // only need to re-fit when the *set* of resources changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uidsKey, rf]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === "namespace") return;
      const data = node.data as BaseNodeData;
      if (!data?.resource) return;
      onInspect?.(data.resource);
    },
    [onInspect],
  );

  const isEmpty = Object.keys(renderSnapshot.resources).length === 0;

  return (
    <div
      className={
        "relative h-full w-full overflow-hidden rounded-md border border-cosmos-border bg-cosmos-panel " +
        (className ?? "")
      }
      aria-label="Live Kubernetes cluster view"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        zoomOnScroll={true}
        panOnScroll={true}
        panOnDrag={true}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
        minZoom={0.4}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        onNodeClick={handleNodeClick}
        colorMode="dark"
      >
        <Background gap={20} size={1} color="#1f2a37" />
      </ReactFlow>
      {isEmpty && <EmptyState />}
    </div>
  );
}

export default function ClusterView(props: ClusterViewProps) {
  return (
    <ReactFlowProvider>
      <ClusterViewInner {...props} />
    </ReactFlowProvider>
  );
}
