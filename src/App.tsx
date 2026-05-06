import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

// M0 walking skeleton: prove that React ↔ Rust IPC works.
// Stream B will replace this with the real title scene.

export default function App() {
  const [pong, setPong] = useState<string>("…");
  const [docker, setDocker] = useState<string>("checking…");

  useEffect(() => {
    invoke<string>("ping").then(setPong).catch((e) => setPong(`error: ${e}`));
    invoke<{ ok: boolean; reason?: string }>("docker_health")
      .then((r) => setDocker(r.ok ? "ready" : `not ready — ${r.reason ?? "?"}`))
      .catch((e) => setDocker(`error: ${e}`));
  }, []);

  return (
    <main className="splash">
      <h1>Cosmos Corp</h1>
      <p className="tagline">Day One — onboarding starts soon.</p>
      <dl className="diagnostics">
        <dt>IPC ping</dt>
        <dd>{pong}</dd>
        <dt>Docker</dt>
        <dd>{docker}</dd>
      </dl>
    </main>
  );
}
