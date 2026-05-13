"use client";

import { useEffect, useState } from "react";
import { getOhsee, isElectronRuntime } from "@/lib/electron";

type Props = {
  /** Default URL to record against (usually project.prodUrl). */
  defaultUrl: string;
  /** Called with the captured script when the user stops or closes the inspector. */
  onScriptCaptured: (script: string) => void;
  /** Optional label override for the trigger button. */
  label?: string;
};

type RecordingState =
  | { status: "idle" }
  | { status: "prompting"; url: string }
  | { status: "recording"; sessionId: string }
  | { status: "fetching" }
  | { status: "error"; message: string };

export default function CodegenRecorder({ defaultUrl, onScriptCaptured, label }: Props) {
  const [state, setState] = useState<RecordingState>({ status: "idle" });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (state.status !== "recording") return;
    const ohsee = getOhsee();
    if (!ohsee) return;

    const unsubscribeExit = ohsee.codegen.onExited(async ({ sessionId }) => {
      if (sessionId !== state.sessionId) return;
      await finish(sessionId);
    });
    const unsubscribeError = ohsee.codegen.onError(({ sessionId, message }) => {
      if (sessionId !== state.sessionId) return;
      setState({ status: "error", message });
    });

    return () => {
      unsubscribeExit();
      unsubscribeError();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.status === "recording" ? state.sessionId : null]);

  async function finish(sessionId: string) {
    const ohsee = getOhsee();
    if (!ohsee) return;
    setState({ status: "fetching" });
    try {
      const { script } = await ohsee.codegen.stop(sessionId);
      if (!script.trim()) {
        setState({ status: "error", message: "Recording ended but no script was captured." });
        return;
      }
      onScriptCaptured(script);
      setState({ status: "idle" });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function startRecording(url: string) {
    const ohsee = getOhsee();
    if (!ohsee) return;
    const target = url.trim() || defaultUrl;
    if (!target) {
      setState({ status: "error", message: "Enter a URL to record against." });
      return;
    }
    try {
      const { sessionId } = await ohsee.codegen.start({ url: target });
      setState({ status: "recording", sessionId });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function stopRecording() {
    if (state.status !== "recording") return;
    await finish(state.sessionId);
  }

  // Gate on mount so SSR doesn't render anything (window.ohsee is renderer-only)
  if (!mounted || !isElectronRuntime()) return null;

  return (
    <>
      <button
        onClick={() => setState({ status: "prompting", url: defaultUrl })}
        className="flow-chip flow-chip--accent"
      >
        ⏺ {label ?? "Record with Playwright"}
      </button>

      {state.status === "prompting" && (
        <PromptModal
          defaultUrl={defaultUrl}
          onCancel={() => setState({ status: "idle" })}
          onStart={(url) => startRecording(url)}
        />
      )}

      {state.status === "recording" && (
        <RecordingModal onStop={stopRecording} />
      )}

      {state.status === "fetching" && (
        <RecordingModal stopping />
      )}

      {state.status === "error" && (
        <ErrorModal message={state.message} onDismiss={() => setState({ status: "idle" })} />
      )}
    </>
  );
}

function PromptModal({
  defaultUrl,
  onCancel,
  onStart,
}: {
  defaultUrl: string;
  onCancel: () => void;
  onStart: (url: string) => void;
}) {
  const [url, setUrl] = useState(defaultUrl);
  return (
    <div className="modal">
      <div className="modal__panel modal__panel--compact" style={{ width: 480, maxWidth: 480, border: "1px solid var(--border-primary)", background: "var(--surface-primary)" }}>
        <h3 className="section-heading" style={{ marginBottom: "var(--space-2)", fontSize: "var(--font-size-lg)" }}>Record with Playwright</h3>
        <p className="section-body" style={{ marginBottom: "var(--space-4)" }}>
          Playwright will open a browser window and an inspector. Interact with the page; each action is captured as a Playwright step. Close the inspector or press Stop when done.
        </p>
        <label className="field__label field__label--sm" style={{ fontWeight: "var(--weight-bold)" }}>Starting URL</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="input input--compact input--solid-bg"
          style={{ background: "var(--surface-tertiary)", marginBottom: "var(--space-4)" }}
          autoFocus
        />
        <div className="modal__actions modal__actions--sm">
          <button onClick={onCancel} className="btn btn--ghost">
            Cancel
          </button>
          <button
            onClick={() => onStart(url)}
            disabled={!url.trim()}
            className="btn btn--primary-sm"
          >
            Start Recording
          </button>
        </div>
      </div>
    </div>
  );
}

function RecordingModal({ onStop, stopping }: { onStop?: () => void; stopping?: boolean }) {
  return (
    <div className="modal">
      <div className="modal__panel modal__panel--compact" style={{ width: 420, maxWidth: 420, border: "1px solid var(--border-primary)", background: "var(--surface-primary)" }}>
        <h3 className="section-heading" style={{ marginBottom: "var(--space-2)", fontSize: "var(--font-size-lg)" }}>
          {stopping ? "Finishing…" : "Recording"}
        </h3>
        <p className="section-body" style={{ marginBottom: "var(--space-4)" }}>
          {stopping
            ? "Fetching the captured script — one moment."
            : "Interact with the browser window. When you're done, close the Playwright Inspector or press Stop below."}
        </p>
        {!stopping && (
          <div className="modal__actions modal__actions--sm">
            <button onClick={onStop} className="btn btn--danger-outline">
              Stop Recording
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorModal({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="modal">
      <div className="modal__panel modal__panel--compact" style={{ width: 420, maxWidth: 420, border: "1px solid color-mix(in srgb, var(--status-error) 40%, transparent)", background: "var(--surface-primary)" }}>
        <h3 className="section-heading" style={{ marginBottom: "var(--space-2)", fontSize: "var(--font-size-lg)", color: "var(--status-error)" }}>
          Recording failed
        </h3>
        <p className="section-body" style={{ marginBottom: "var(--space-4)" }}>{message}</p>
        <div className="modal__actions modal__actions--sm">
          <button onClick={onDismiss} className="btn btn--primary-sm">
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
