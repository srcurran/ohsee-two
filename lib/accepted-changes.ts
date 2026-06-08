"use client";

/** Per-browser "accepted change" tracking. Accepting a change marks an
 *  expected diff as reviewed: the entry stays in the list with an accepted
 *  style, but it stops counting toward a page's / report's change totals so
 *  the badges reflect only the diffs still worth attention.
 *
 *  Keyed by `${reportId}::${changeGroupKey(change)}` — the same stable
 *  cross-breakpoint identity the list uses as its React key (change `id` is a
 *  per-detection UUID, so it can't be used). Stored in localStorage (mirrors
 *  lib/viewed-reports.ts): survives reloads, stays per-browser, and a custom
 *  event keeps every mounted hook in sync within the tab. */

import { useEffect, useState } from "react";
import { changeGroupKey } from "./change-identity";
import type { SemanticChange } from "./types";

const KEY = "ohsee:accepted-changes";
const EVENT = "ohsee:accepted-changes-change";

/** localStorage key for one accepted change within a report. */
export function acceptedChangeKey(reportId: string, change: SemanticChange): string {
  return `${reportId}::${changeGroupKey(change)}`;
}

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
    // localStorage may be unavailable (private mode) — non-fatal.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Toggle a change's accepted state (by its `acceptedChangeKey`). */
export function toggleAcceptedChange(key: string): void {
  if (!key || typeof window === "undefined") return;
  const set = readSet();
  if (set.has(key)) set.delete(key);
  else set.add(key);
  writeSet(set);
}

/** Subscribes to the accepted-changes set; re-renders on same-tab (custom
 *  event) and cross-tab (`storage` event) updates. */
export function useAcceptedChanges(): { accepted: Set<string>; toggle: (key: string) => void } {
  const [accepted, setAccepted] = useState<Set<string>>(() => readSet());
  useEffect(() => {
    const refresh = () => setAccepted(readSet());
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return { accepted, toggle: toggleAcceptedChange };
}

/** Drop accepted changes from a breakpoint's change list — used to recompute
 *  counts so accepted diffs don't inflate the badges. */
export function activeChanges(
  changes: SemanticChange[] | undefined,
  reportId: string,
  accepted: Set<string>,
): SemanticChange[] {
  if (!changes || changes.length === 0) return changes ?? [];
  if (accepted.size === 0) return changes;
  return changes.filter((c) => !accepted.has(acceptedChangeKey(reportId, c)));
}
