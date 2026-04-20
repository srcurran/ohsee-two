import type { SemanticChange } from "./types";

/**
 * Stable identity for a structural change. Two breakpoints reporting the same
 * justify-content change on the same element will produce the same key, so
 * cross-breakpoint aggregations can dedupe.
 *
 * `id` on SemanticChange is per-detection (a fresh UUID each run), so we
 * build the key from the semantic shape instead.
 */
export function semanticChangeKey(change: SemanticChange): string {
  const prop = change.details?.property ?? "";
  const prod = change.details?.prodValue ?? "";
  const dev = change.details?.devValue ?? "";
  return `${change.selector}::${change.category}::${prop}::${prod}->${dev}`;
}

/** Unique count of structural changes across one or more breakpoint results. */
export function countUniqueSemanticChanges(
  changesPerBreakpoint: Iterable<SemanticChange[] | undefined>,
): number {
  const seen = new Set<string>();
  for (const changes of changesPerBreakpoint) {
    if (!changes) continue;
    for (const c of changes) seen.add(semanticChangeKey(c));
  }
  return seen.size;
}
