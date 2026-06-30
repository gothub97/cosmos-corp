/**
 * DevTerminalScene - walking-skeleton entry point for the M0 integration test.
 *
 * Purpose: prove that React ↔ Rust ↔ portable-pty ↔ xterm.js works end to end
 * before we bother with Docker, content, or scene wiring. The Rust side
 * exposes a debug command `open_host_bash_pty` that spawns `bash -l` on the
 * host (no container) and pipes bytes through the existing `pty:data` event
 * + `write_pty` / `resize_pty` commands.
 *
 * Sequencing matters: we wait for Terminal's `onReady` (which fires after the
 * `pty:data` listener is subscribed) before invoking `open_host_bash_pty`,
 * otherwise the shell's banner bytes can race past us.
 *
 * This screen is reachable from the Title scene's "Dev: open raw terminal"
 * affordance and is otherwise hidden from end users.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Terminal, { type TerminalHandle } from "../components/Terminal";
import { useGameStore } from "../game/store";

export default function DevTerminalScene() {
  const goTo = useGameStore((s) => s.goTo);
  const ref = useRef<TerminalHandle>(null);
  const spawnedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // After the pty:data listener is wired (Terminal's onReady), spawn the
  // host bash PTY. Guard against React StrictMode's double-invocation.
  const handleReady = useCallback(() => {
    ref.current?.focus();
    if (spawnedRef.current) return;
    spawnedRef.current = true;
    void invoke("open_host_bash_pty").catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "open_host_bash_pty failed");
      // Allow a retry click below.
      spawnedRef.current = false;
    });
  }, []);

  // Reset the spawn guard if the scene unmounts so a re-mount can re-spawn.
  useEffect(
    () => () => {
      spawnedRef.current = false;
    },
    [],
  );

  return (
    <main className="flex h-full flex-col gap-3 p-4">
      <header className="flex items-center justify-between rounded-lg border border-cosmos-border bg-cosmos-panel/70 px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => goTo({ kind: "title" })}
            className="rounded px-2 py-1 text-xs text-cosmos-muted hover:text-phosphor-400"
          >
            ← Title
          </button>
          <span className="font-mono text-xs uppercase tracking-widest text-phosphor-400">
            M0 - walking skeleton
          </span>
        </div>
        <span className="text-xs text-cosmos-muted">
          bash via portable-pty (no docker)
        </span>
      </header>

      <p className="text-xs text-cosmos-muted">
        Type <code className="font-mono text-phosphor-200">echo hello</code> -
        if the Rust PTY is wired, the response renders below.
      </p>

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          <span>Could not start host bash PTY: {error}</span>
          <button
            type="button"
            onClick={() => {
              setError(null);
              handleReady();
            }}
            className="ml-3 rounded px-2 py-0.5 text-xs hover:bg-danger/20"
          >
            retry
          </button>
        </div>
      )}

      <section className="min-h-0 flex-1">
        <Terminal ref={ref} className="h-full" onReady={handleReady} />
      </section>
    </main>
  );
}
