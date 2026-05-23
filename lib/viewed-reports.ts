"use client";

/** Per-browser "viewed report" tracking. A test's sidebar dot starts solid
 *  when its latest report is unviewed and switches to a 2-pixel outline
 *  once the user opens that report — a new run creates a new report id,
 *  so re-running a test naturally resets the indicator to solid.
 *
 *  Stored in localStorage so the state survives reloads but stays
 *  per-browser (no server round-trip). A custom event lets every mounted
 *  hook reflect a `markReportViewed` call in the same tab without
 *  refetching from storage; the standard `storage` event handles other
 *  tabs. */

import { useEffect, useState } from "react";

const KEY = "ohsee:viewed-reports";
const EVENT = "ohsee:viewed-reports-change";

function readSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function writeSet(set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    // localStorage might be unavailable (Safari private mode etc.) —
    // not fatal, just means the viewed state won't persist.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Idempotent — calling with an already-viewed id is a no-op. */
export function markReportViewed(reportId: string): void {
  if (!reportId || typeof window === "undefined") return;
  const set = readSet();
  if (set.has(reportId)) return;
  set.add(reportId);
  writeSet(set);
}

/** Subscribes to the viewed-reports set; re-renders on same-tab updates
 *  (custom event) and cross-tab updates (`storage` event). */
export function useViewedReports(): Set<string> {
  const [set, setSet] = useState<Set<string>>(() => readSet());
  useEffect(() => {
    const refresh = () => setSet(readSet());
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return set;
}
