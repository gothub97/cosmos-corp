/**
 * Terminal.tsx - xterm.js wrapper bridged to the Rust PTY.
 *
 * Outgoing keystrokes  : onData       → engine.writePty(bytes)
 * Incoming PTY bytes   : "pty:data"   → terminal.write(...)
 * Resize               : fit() result → engine.resizePty(cols, rows)
 *
 * All IPC funnels through the `engine` singleton so that future instrumentation
 * (logging, mock engines for component tests) has a single seam.
 *
 * Parent components can call .focus() and .clear() through the forwarded ref.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal as XTerm, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";

import type { EventPayload } from "../ipc/contract";
import { engine } from "../game/engine";

// ─── Cosmos Corp xterm theme ─────────────────────────────────────────────────
// Matches the tailwind tokens in src/styles/globals.css.
const COSMOS_THEME: ITheme = {
  background: "#07090d",
  foreground: "#d6e0ee",
  cursor: "#ffb454",
  cursorAccent: "#07090d",
  selectionBackground: "#1f2a37",
  selectionForeground: "#e6fff4",
  black: "#0d1117",
  red: "#ff5c5c",
  green: "#4cd996",
  yellow: "#ffb454",
  blue: "#7aa2f7",
  magenta: "#bb9af7",
  cyan: "#7dcfff",
  white: "#d6e0ee",
  brightBlack: "#7d8aa0",
  brightRed: "#ff7a7a",
  brightGreen: "#9bf3c4",
  brightYellow: "#ffce85",
  brightBlue: "#9eb8ff",
  brightMagenta: "#d3b6ff",
  brightCyan: "#aee8ff",
  brightWhite: "#ffffff",
};

export interface TerminalHandle {
  /** Move keyboard focus into the terminal. */
  focus: () => void;
  /** Clear the visible buffer. Does not reset the remote shell. */
  clear: () => void;
  /** Manually trigger a fit() - useful when the parent layout shifts. */
  fit: () => void;
  /** Write bytes/text into the terminal locally (no PTY round-trip). */
  writeLocal: (data: string) => void;
}

export interface TerminalProps {
  /** Forwarded to the wrapping div for layout. */
  className?: string;
  /** Disable PTY wiring - useful for design previews & storybook. */
  detached?: boolean;
  /** Called once xterm.js has mounted and addons are loaded. */
  onReady?: () => void;
}

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: false });

/** Tauri serializes Vec<u8> as a plain number[]. Reconstruct a Uint8Array. */
function bytesToString(bytes: number[] | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  return TEXT_DECODER.decode(u8);
}

function stringToBytes(s: string): Uint8Array {
  return TEXT_ENCODER.encode(s);
}

const Terminal = forwardRef<TerminalHandle, TerminalProps>(function Terminal(
  { className, detached = false, onReady },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  // Imperative API exposed to parents.
  useImperativeHandle(
    ref,
    () => ({
      focus: () => termRef.current?.focus(),
      clear: () => termRef.current?.clear(),
      fit: () => {
        try {
          fitRef.current?.fit();
        } catch {
          /* container not yet measured - ignore */
        }
      },
      writeLocal: (data: string) => termRef.current?.write(data),
    }),
    [],
  );

  // Mount xterm.js once. We intentionally let StrictMode double-invoke here:
  // the cleanup disposes the instance and the second mount creates a fresh one.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new XTerm({
      fontFamily:
        '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: "block",
      allowProposedApi: true,
      // Slightly larger scrollback for browsing earlier output without leaving
      // the mission.
      scrollback: 5000,
      theme: COSMOS_THEME,
      // Convert \n into \r\n on the way in - many of our setup scripts emit
      // bare LFs and xterm needs CRLF for proper cursor return.
      convertEol: false,
      // Match prefers-reduced-motion users - disable cursor blink there.
      ...(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? { cursorBlink: false }
        : {}),
    });

    const fit = new FitAddon();
    const links = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(links);
    term.open(el);

    termRef.current = term;
    fitRef.current = fit;

    // Initial fit - guard against a zero-sized parent.
    let initialCols = 80;
    let initialRows = 24;
    try {
      fit.fit();
      initialCols = term.cols;
      initialRows = term.rows;
    } catch {
      /* ignore */
    }

    // ─── Wire IPC ───────────────────────────────────────────────────────────
    const unlisteners: UnlistenFn[] = [];
    let onDataDispose: { dispose: () => void } | null = null;
    // Tracks whether the cleanup phase has run before the async listen()
    // resolved. If so, we immediately call the unlisten on resolution.
    let cancelled = false;

    if (!detached) {
      // Send the initial size to the Rust side before any data flows.
      // The backend silently no-ops resize_pty when no PTY session is open
      // (e.g., on the title scene or before DevTerminalScene spawns bash),
      // so this only ever surfaces real IPC infrastructure failures.
      void engine.resizePty(initialCols, initialRows).catch((err) => {
        console.warn("[Terminal] initial resize_pty failed:", err);
      });

      // Outgoing keystrokes → Rust (via engine for the shared IPC seam).
      onDataDispose = term.onData((data) => {
        void engine.writePty(stringToBytes(data)).catch((err) => {
          console.error("[Terminal] write_pty failed:", err);
        });
      });

      // Incoming bytes from the PTY → terminal. We intentionally call
      // onReady() *after* this subscription resolves so callers (e.g. the
      // M0 DevTerminalScene) can safely spawn the PTY without dropping the
      // shell's banner bytes.
      listen<EventPayload<"pty:data">>("pty:data", (event) => {
        const text = bytesToString(event.payload.bytes);
        term.write(text);
      })
        .then((unlisten) => {
          if (cancelled) {
            unlisten();
            return;
          }
          unlisteners.push(unlisten);
          onReady?.();
        })
        .catch((err) => {
          console.error("[Terminal] failed to subscribe pty:data:", err);
          // Still notify so the parent doesn't hang forever on a missing
          // listener - they can decide whether to retry.
          if (!cancelled) onReady?.();
        });
    } else {
      // Detached previews: fire onReady on the next tick so behavior matches
      // the wired path (always async).
      window.queueMicrotask(() => {
        if (!cancelled) onReady?.();
      });
    }

    // ─── Resize handling ────────────────────────────────────────────────────
    let lastCols = initialCols;
    let lastRows = initialRows;
    const onResize = () => {
      try {
        fit.fit();
      } catch {
        return;
      }
      const cols = term.cols;
      const rows = term.rows;
      if (cols === lastCols && rows === lastRows) return;
      lastCols = cols;
      lastRows = rows;
      if (!detached) {
        void engine.resizePty(cols, rows).catch((err) => {
          console.warn("[Terminal] resize_pty failed:", err);
        });
      }
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    window.addEventListener("resize", onResize);

    // ─── Paste handling ─────────────────────────────────────────────────────
    // xterm handles paste via the browser natively (it forwards onData). We
    // hook copy via Cmd/Ctrl+C only when there is a selection - otherwise let
    // the keystroke pass through to the PTY (Ctrl+C = SIGINT).
    const onKeyDown = (ev: KeyboardEvent) => {
      const meta = ev.metaKey || ev.ctrlKey;
      if (!meta) return;
      const sel = term.getSelection();
      // Cmd/Ctrl+C → copy (only if there's a selection).
      if (ev.key.toLowerCase() === "c" && sel) {
        void navigator.clipboard.writeText(sel).catch(() => {
          /* clipboard may be denied - ignore */
        });
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      // Cmd/Ctrl+V → paste from system clipboard, push as input.
      if (ev.key.toLowerCase() === "v") {
        ev.preventDefault();
        ev.stopPropagation();
        void navigator.clipboard
          .readText()
          .then((text) => {
            if (!text) return;
            if (detached) {
              term.write(text);
            } else {
              void engine.writePty(stringToBytes(text)).catch((err) => {
                console.error("[Terminal] paste write_pty failed:", err);
              });
            }
          })
          .catch(() => {
            /* clipboard read may be denied - ignore */
          });
      }
    };
    el.addEventListener("keydown", onKeyDown, true);

    // (onReady fires from the listen() resolution path above so callers can
    // rely on the pty:data subscription being live before they spawn a PTY.)

    return () => {
      cancelled = true;
      el.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      onDataDispose?.dispose();
      unlisteners.forEach((u) => u());
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detached]);

  return (
    <div
      ref={containerRef}
      className={
        "h-full w-full rounded-md border border-cosmos-border bg-cosmos-panel p-2 " +
        "shadow-[inset_0_0_30px_rgba(0,0,0,0.45)] " +
        (className ?? "")
      }
      role="application"
      aria-label="Embedded terminal - type commands here"
      tabIndex={-1}
    />
  );
});

export default Terminal;
