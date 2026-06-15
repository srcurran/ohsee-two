"use client";

import { useDataDir } from "@/components/settings/useDataDir";

/**
 * Settings page → Projects folder. Electron-only: lets the user see and change
 * where their projects, reports, and screenshots live on disk. Renders nothing
 * in the web build. The overlay (SettingsOverlay) has its own rendering of the
 * same `useDataDir` hook.
 */
export default function StorageSettings() {
  const { available, displayed, dataDir, pendingDir, error, change, reveal, restart } = useDataDir();

  if (!available) return null;

  return (
    <section className="section-block animate-card-in" style={{ animationDelay: "85ms" }}>
      <p className="section-heading" style={{ fontWeight: "var(--weight-regular)" }}>
        Projects folder
      </p>
      <p className="section-body" style={{ marginBottom: "var(--space-3)" }}>
        Where your projects, reports, and screenshots are stored on disk.
      </p>

      <p className="data-dir-path">{displayed ?? "Loading…"}</p>

      {pendingDir && (
        <div className="info-box" style={{ marginTop: "var(--space-3)" }}>
          <p className="section-body" style={{ margin: 0 }}>
            Restart to start using the new folder. Projects in the previous location stay where they are.
          </p>
          <button onClick={restart} className="btn btn--primary-sm" style={{ marginTop: "var(--space-3)" }}>
            Restart now
          </button>
        </div>
      )}

      {error && (
        <p className="error-text" style={{ marginTop: "var(--space-2)" }}>
          {error}
        </p>
      )}

      <div className="row row--sm" style={{ marginTop: "var(--space-3)" }}>
        <button onClick={change} className="btn btn--ghost">
          Change…
        </button>
        <button onClick={reveal} className="btn btn--ghost" disabled={!dataDir}>
          Open folder
        </button>
      </div>
    </section>
  );
}
