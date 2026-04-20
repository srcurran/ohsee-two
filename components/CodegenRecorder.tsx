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
        className="rounded-[6px] bg-foreground/10 px-[10px] py-[4px] text-[12px] font-bold text-foreground transition-colors hover:bg-foreground/20"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[480px] rounded-[12px] border border-border-primary bg-surface-primary p-[20px]">
        <h3 className="mb-[8px] text-[16px] font-bold text-foreground">Record with Playwright</h3>
        <p className="mb-[16px] text-[13px] text-text-muted">
          Playwright will open a browser window and an inspector. Interact with the page; each action is captured as a Playwright step. Close the inspector or press Stop when done.
        </p>
        <label className="mb-[8px] block text-[12px] font-bold text-text-muted">Starting URL</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="mb-[16px] w-full rounded-[8px] border border-border-primary bg-surface-tertiary px-[12px] py-[8px] text-[14px] text-foreground outline-none focus:border-foreground"
          autoFocus
        />
        <div className="flex justify-end gap-[8px]">
          <button
            onClick={onCancel}
            className="rounded-[8px] px-[16px] py-[8px] text-[13px] text-text-muted transition-colors hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={() => onStart(url)}
            disabled={!url.trim()}
            className="rounded-[8px] bg-foreground px-[16px] py-[8px] text-[13px] font-bold text-surface-content transition-all hover:-translate-y-[1px] hover:shadow-elevation-md disabled:opacity-50"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[420px] rounded-[12px] border border-border-primary bg-surface-primary p-[20px]">
        <h3 className="mb-[8px] text-[16px] font-bold text-foreground">
          {stopping ? "Finishing…" : "Recording"}
        </h3>
        <p className="mb-[16px] text-[13px] text-text-muted">
          {stopping
            ? "Fetching the captured script — one moment."
            : "Interact with the browser window. When you're done, close the Playwright Inspector or press Stop below."}
        </p>
        {!stopping && (
          <div className="flex justify-end">
            <button
              onClick={onStop}
              className="rounded-[8px] bg-status-error/10 px-[16px] py-[8px] text-[13px] font-bold text-status-error transition-colors hover:bg-status-error/20"
            >
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[420px] rounded-[12px] border border-status-error/40 bg-surface-primary p-[20px]">
        <h3 className="mb-[8px] text-[16px] font-bold text-status-error">Recording failed</h3>
        <p className="mb-[16px] text-[13px] text-text-muted">{message}</p>
        <div className="flex justify-end">
          <button
            onClick={onDismiss}
            className="rounded-[8px] bg-foreground px-[16px] py-[8px] text-[13px] font-bold text-surface-content"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
