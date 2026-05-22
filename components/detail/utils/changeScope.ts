/** Cross-breakpoint change classification.
 *
 * Groups each semantic change by a coarse identity key (selector + category +
 * property, ignoring breakpoint-specific values) and classifies it as:
 *
 *  • **universal** — the same logical change appears at every captured
 *    breakpoint (e.g. a text change or a colour swap).
 *  • **breakpoint-specific** — the change only appears at some breakpoints
 *    (e.g. a max-width that only fires above 1024px).
 *
 * The result object is designed to be memoised once per page and shared with
 * both BreakpointTabs (for smarter deviation dots) and ChangeList (for per-
 * entry annotations). */

import type { BreakpointResult, SemanticChange } from "@/lib/types";
import { changeGroupKey, topLevelSelector } from "@/lib/change-identity";

export interface ChangeScope {
  /** Is this individual change universal across all captured breakpoints? */
  isUniversal: (c: SemanticChange) => boolean;
  /** How many breakpoints does this change appear at? */
  bpCountFor: (c: SemanticChange) => number;
  /** Total breakpoints with semantic data. */
  totalBps: number;
  /** Number of breakpoint-specific (non-universal) changes at each bp. */
  specificCountPerBp: Record<string, number>;
  /** Unique element groups with only universal changes at each bp. */
  universalGroupCountPerBp: Record<string, number>;
  /** Unique element groups with any specific changes at each bp. */
  specificGroupCountPerBp: Record<string, number>;
}

export function classifyChanges(
  bpData: Record<string, BreakpointResult>,
): ChangeScope {
  // Only consider breakpoints that have semantic data (not undefined).
  // A breakpoint captured without DOM snapshots (semanticChanges === undefined)
  // can't participate in the universality check.
  const semanticBps: string[] = [];
  for (const [bp, result] of Object.entries(bpData)) {
    if (result.semanticChanges !== undefined) semanticBps.push(bp);
  }

  // Build: groupKey → Set<breakpoint>
  const keyToBps = new Map<string, Set<string>>();
  for (const bp of semanticBps) {
    for (const c of bpData[bp].semanticChanges!) {
      const key = changeGroupKey(c);
      let bps = keyToBps.get(key);
      if (!bps) { bps = new Set(); keyToBps.set(key, bps); }
      bps.add(bp);
    }
  }

  const totalBps = semanticBps.length;
  const universalKeys = new Set<string>();
  for (const [key, bps] of keyToBps) {
    if (bps.size >= totalBps) universalKeys.add(key);
  }

  // Count breakpoint-specific changes per bp
  const specificCountPerBp: Record<string, number> = {};
  for (const bp of semanticBps) {
    let specific = 0;
    for (const c of bpData[bp].semanticChanges!) {
      if (!universalKeys.has(changeGroupKey(c))) specific++;
    }
    specificCountPerBp[bp] = specific;
  }

  // Grouped counts: group changes by top-level selector per bp, then classify
  // each group as universal (ALL changes in the group are universal) or
  // specific (ANY change is specific). Matches the header badge logic.
  const universalGroupCountPerBp: Record<string, number> = {};
  const specificGroupCountPerBp: Record<string, number> = {};
  for (const bp of semanticBps) {
    const selectorBucket = new Map<string, boolean>(); // true = all universal so far
    for (const c of bpData[bp].semanticChanges!) {
      const top = topLevelSelector(c.selector);
      const isUni = universalKeys.has(changeGroupKey(c));
      const prev = selectorBucket.get(top);
      selectorBucket.set(top, prev === undefined ? isUni : prev && isUni);
    }
    let uni = 0;
    let spec = 0;
    for (const allUniversal of selectorBucket.values()) {
      if (allUniversal) uni++;
      else spec++;
    }
    universalGroupCountPerBp[bp] = uni;
    specificGroupCountPerBp[bp] = spec;
  }

  // Build the lookup cache for the callbacks
  const cache = new Map<string, boolean>();
  const countCache = new Map<string, number>();

  const isUniversal = (c: SemanticChange): boolean => {
    const key = changeGroupKey(c);
    let val = cache.get(key);
    if (val === undefined) {
      val = universalKeys.has(key);
      cache.set(key, val);
    }
    return val;
  };

  const bpCountFor = (c: SemanticChange): number => {
    const key = changeGroupKey(c);
    let val = countCache.get(key);
    if (val === undefined) {
      val = keyToBps.get(key)?.size ?? 0;
      countCache.set(key, val);
    }
    return val;
  };

  return { isUniversal, bpCountFor, totalBps, specificCountPerBp, universalGroupCountPerBp, specificGroupCountPerBp };
}
