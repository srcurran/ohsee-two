/**
 * In-memory registry of pending *manual* OTP prompts.
 *
 * A login script using `$OTP$` with a `manual` credential can't pre-fill the
 * code — the real one-time code only exists once the login form is submitted
 * and the site sends it (SMS / email / authenticator). So the runner pauses at
 * that point and `await`s {@link requestManualOtp}, which parks a promise here
 * until the user types the code in the UI and the submit endpoint resolves it.
 *
 * Both the blocked login (server-side Playwright run) and the submit endpoint
 * live in the same Next server process, so a module-level Map is a sufficient
 * bridge — no IPC or persistence needed. Requests are keyed by an unguessable
 * id; the client discovers them by polling {@link listPendingOtp} with the
 * `runId` it owns.
 *
 * Because prod and dev each trigger their *own* code, the caller is expected to
 * serialize the two logins (one request in flight at a time) so the user always
 * knows which code the current prompt is asking for.
 */

import { randomUUID } from "crypto";

export interface PendingOtpInfo {
  /** Unguessable id the client posts the code back to. */
  id: string;
  /** Groups requests for one "generate session" run so the client can poll. */
  runId: string;
  /** Which environment's login is waiting — e.g. "Prod" / "Dev". */
  env: string;
  /** Optional extra context (profile name, etc.) for the prompt. */
  label?: string;
  /** Epoch ms the request was created (so the UI can show elapsed time). */
  createdAt: number;
}

interface PendingOtp extends PendingOtpInfo {
  resolve: (code: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingOtp>();

/** How long a prompt waits for the user before giving up. */
const PROMPT_TIMEOUT_MS = 5 * 60_000;

/**
 * Park a promise for a manual OTP and return it. Resolves with the code the
 * user submits via {@link submitManualOtp}, or rejects on timeout / cancel.
 */
export function requestManualOtp(opts: {
  runId: string;
  env: string;
  label?: string;
}): Promise<string> {
  const id = randomUUID();
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(
        new Error(
          `Timed out after ${Math.round(PROMPT_TIMEOUT_MS / 1000)}s waiting for the ${opts.env} verification code.`,
        ),
      );
    }, PROMPT_TIMEOUT_MS);
    // Don't let a parked prompt keep the process alive on its own.
    if (typeof timer.unref === "function") timer.unref();

    pending.set(id, {
      id,
      runId: opts.runId,
      env: opts.env,
      label: opts.label,
      createdAt: Date.now(),
      resolve,
      reject,
      timer,
    });
  });
}

/** Pending requests, optionally filtered to one run. UI-safe subset only. */
export function listPendingOtp(runId?: string): PendingOtpInfo[] {
  const all = [...pending.values()];
  const scoped = runId ? all.filter((p) => p.runId === runId) : all;
  return scoped
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(({ id, runId: r, env, label, createdAt }) => ({
      id,
      runId: r,
      env,
      label,
      createdAt,
    }));
}

/**
 * Resolve a pending request with the user-supplied code. Returns false if the
 * id is unknown (already resolved, cancelled, or timed out).
 */
export function submitManualOtp(id: string, code: string): boolean {
  const entry = pending.get(id);
  if (!entry) return false;
  clearTimeout(entry.timer);
  pending.delete(id);
  entry.resolve(code);
  return true;
}

/**
 * Reject every still-pending request for a run (e.g. the login already failed
 * for another reason, or the user navigated away). No-op if none are pending.
 */
export function cancelOtpRequests(runId: string, reason = "OTP entry cancelled"): void {
  for (const entry of [...pending.values()]) {
    if (entry.runId !== runId) continue;
    clearTimeout(entry.timer);
    pending.delete(entry.id);
    entry.reject(new Error(reason));
  }
}
