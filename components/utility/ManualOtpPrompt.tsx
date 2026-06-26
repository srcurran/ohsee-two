"use client";

import { useEffect, useState } from "react";

/** A manual-OTP prompt a paused sign-in is currently blocked on. */
export interface OtpPrompt {
  id: string;
  env: string;
  label?: string;
}

/**
 * Polls for manual-OTP prompts belonging to a run and renders the code-entry
 * dialog when one is waiting. Used anywhere a sign-in script (with a manual
 * `$OTP$` credential) can run: the auth-profile "Test sign in" flow and live
 * test/report runs. `runId` scopes the poll; `active` turns polling on only
 * while the run is in flight.
 *
 * The blocked login parks one prompt at a time (prod, then dev), so the dialog
 * shows them in sequence — the code the user just received unambiguously
 * belongs to the environment currently asking.
 */
export function ManualOtpPrompt({
  runId,
  active,
}: {
  runId: string | null | undefined;
  active: boolean;
}) {
  const [prompt, setPrompt] = useState<OtpPrompt | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!active || !runId) {
      setPrompt(null);
      return;
    }
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/otp-requests?runId=${encodeURIComponent(runId)}`);
        if (!r.ok) return;
        const { pending } = (await r.json()) as { pending: OtpPrompt[] };
        setPrompt((cur) => {
          if (pending.length === 0) return null;
          // Keep the current dialog if its prompt is still pending; otherwise
          // advance to the next environment's prompt.
          const stillPending = cur && pending.some((p) => p.id === cur.id);
          return stillPending ? cur : pending[0];
        });
      } catch {
        // Transient poll failure — retry on the next tick.
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [active, runId]);

  /** Hand the typed code to the blocked login, then clear the dialog. */
  const submit = async (code: string) => {
    if (!prompt) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/otp-requests/${prompt.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.ok) setPrompt(null);
    } catch {
      // Leave the dialog open so the user can retry.
    } finally {
      setSubmitting(false);
    }
  };

  if (!prompt) return null;
  return <OtpPromptDialog key={prompt.id} prompt={prompt} submitting={submitting} onSubmit={submit} />;
}

/** Run-time prompt for a single manual OTP. Remounted per prompt (keyed by id),
 *  so its field state is fresh for each environment. */
function OtpPromptDialog({
  prompt,
  submitting,
  onSubmit,
}: {
  prompt: OtpPrompt;
  submitting: boolean;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = useState("");

  const submit = () => {
    if (code.trim() && !submitting) onSubmit(code.trim());
  };

  return (
    <div className="modal">
      <div className="modal__panel modal__panel--compact">
        <h3 className="modal__title" style={{ fontSize: "var(--font-size-xl)", marginBottom: "var(--space-2)" }}>
          Enter {prompt.env} verification code
        </h3>
        <p className="field__hint" style={{ marginBottom: "var(--space-4)" }}>
          {prompt.label ? `“${prompt.label}” is ` : "The sign-in is "}
          signing in to <strong>{prompt.env}</strong>. Type the code that was just
          sent for this environment.
        </p>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="123456"
          className="input input--compact input--code"
          style={{ background: "var(--neutral-light-200)" }}
          autoFocus
        />
        <div className="modal__actions modal__actions--sm" style={{ marginTop: "var(--space-5)" }}>
          <button onClick={submit} disabled={submitting || !code.trim()} className="btn btn--primary-sm">
            {submitting ? "Submitting…" : "Submit code"}
          </button>
        </div>
      </div>
    </div>
  );
}
