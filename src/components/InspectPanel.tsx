/**
 * InspectPanel - slide-in drawer that shows `kubectl describe` output for a
 * cluster resource.
 *
 * Opens from the right edge (360px) when a node in ClusterView is clicked.
 * Header shows kind/name/namespace; body fetches via `engine.describeResource`
 * and renders the captured stdout in a monospaced, scrollable <pre>.
 *
 * Accessibility:
 *   - role="dialog", aria-modal="true", aria-labelledby on the header.
 *   - Focus moves to the close button on open; Escape and outside-click close.
 *   - prefers-reduced-motion respected (slide animation suppressed).
 */

import { useEffect, useRef, useState } from "react";
import type { K8sResource } from "../ipc/contract";
import { engine } from "../game/engine";

export interface InspectPanelProps {
  /** The resource to inspect, or null to keep the panel hidden. */
  resource: K8sResource | null;
  /** Called when the user dismisses the panel (close button / Esc / outside click). */
  onClose: () => void;
}

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; text: string }
  | { kind: "error"; message: string };

export default function InspectPanel({ resource, onClose }: InspectPanelProps) {
  const [fetched, setFetched] = useState<FetchState>({ kind: "idle" });
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Fetch describe output whenever the target uid changes. We key the effect
  // on the uid so flipping between resources fires a fresh fetch even if a
  // previous one is still in flight (cancellation guard via `cancelled`).
  const uid = resource?.uid ?? null;
  useEffect(() => {
    if (!uid) {
      setFetched({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setFetched({ kind: "loading" });
    engine
      .describeResource(uid)
      .then((res) => {
        if (cancelled) return;
        setFetched({ kind: "ready", text: res.text });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setFetched({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Focus the close button on open so keyboard users can dismiss easily.
  useEffect(() => {
    if (!resource) return;
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [resource]);

  // Escape closes.
  useEffect(() => {
    if (!resource) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resource, onClose]);

  // Outside click closes - pointerdown so we beat React Flow's own click handler.
  useEffect(() => {
    if (!resource) return;
    const onPointer = (ev: PointerEvent) => {
      const target = ev.target as Node | null;
      if (!target) return;
      if (panelRef.current && !panelRef.current.contains(target)) {
        onClose();
      }
    };
    // Defer one tick so the click that opened the panel doesn't immediately close it.
    const t = window.setTimeout(
      () => window.addEventListener("pointerdown", onPointer, true),
      0,
    );
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [resource, onClose]);

  if (!resource) return null;

  const titleId = `inspect-${resource.uid}-title`;

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={
        "absolute right-0 top-0 z-40 flex h-full w-[360px] flex-col " +
        "border-l border-cosmos-border bg-cosmos-panel/95 shadow-2xl backdrop-blur-md " +
        "motion-safe:animate-[cosmos-tick-pop_180ms_ease-out]"
      }
    >
      <header className="flex items-start justify-between gap-3 border-b border-cosmos-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-phosphor-400">
            {resource.kind}
          </p>
          <h2
            id={titleId}
            className="truncate font-mono text-sm font-semibold text-cosmos-text"
            title={resource.name}
          >
            {resource.name}
          </h2>
          {resource.namespace && (
            <p className="mt-0.5 truncate text-xs text-cosmos-muted">
              ns: <span className="font-mono">{resource.namespace}</span>
            </p>
          )}
        </div>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label="Close inspect panel"
          className={
            "flex-none rounded-md border border-cosmos-border px-2 py-1 " +
            "text-xs text-cosmos-muted transition-colors hover:text-phosphor-400 " +
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-phosphor-400"
          }
        >
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-cosmos-bg/40">
        {fetched.kind === "loading" && (
          <p className="px-4 py-6 text-xs text-cosmos-muted">
            <span className="cosmos-caret font-mono text-phosphor-400">
              describing
            </span>
          </p>
        )}
        {fetched.kind === "error" && (
          <p
            role="alert"
            className="m-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {fetched.message}
          </p>
        )}
        {fetched.kind === "ready" && (
          <pre className="whitespace-pre-wrap break-words px-4 py-3 font-mono text-xs leading-relaxed text-cosmos-text">
            {fetched.text}
          </pre>
        )}
      </div>
    </aside>
  );
}
