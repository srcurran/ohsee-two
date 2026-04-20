/**
 * Runtime and build-time helpers for Electron builds.
 *
 * Two detection mechanisms:
 * - `IS_ELECTRON_BUILD` — build-time constant from `NEXT_PUBLIC_OHSEE_ELECTRON`.
 *   Available during SSR. Use this to gate server-side logic (e.g., skip redirects).
 * - `isElectronRuntime()` — checks for `window.ohsee` at runtime after preload.
 *   Use this on the client for feature-detecting native APIs.
 *
 * In web builds both resolve to false / undefined. Components using native features
 * must feature-detect — do not assume `window.ohsee` exists.
 */

import type { OhseeNative } from "./electron-types";

export const IS_ELECTRON_BUILD = process.env.NEXT_PUBLIC_OHSEE_ELECTRON === "true";

export function isElectronRuntime(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as { ohsee?: OhseeNative }).ohsee;
}

export function getOhsee(): OhseeNative | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ohsee?: OhseeNative }).ohsee;
}

/**
 * No-op in web builds. In Electron, asks the main process to watch the report
 * and fire a native notification when it reaches a terminal state.
 */
export function trackReportCompletion(reportId: string, projectName: string): void {
  getOhsee()?.notify.trackReport(reportId, projectName).catch(() => {
    /* ignore — renderer shouldn't crash if main process isn't available */
  });
}
