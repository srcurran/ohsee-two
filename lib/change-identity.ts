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

// --- Selector grouping (shared with ChangeList UI) ---

const SEMANTIC_TAGS = new Set([
  "header", "main", "footer", "nav", "section", "article", "aside",
]);

const GENERIC_WRAPPERS = new Set([
  "html", "body", "#root", "#__next", "#app",
]);

function tagFromSegment(seg: string): string {
  const trimmed = seg.trim();
  const naked = trimmed.startsWith(">") ? trimmed.slice(1).trim() : trimmed;
  const match = naked.match(/^[a-zA-Z][\w-]*|^#[\w-]+|^\.[\w-]+/);
  return match ? match[0].toLowerCase() : naked.toLowerCase();
}

export function topLevelSelector(sel: string): string {
  const parts = sel.split(" > ");
  if (parts.length === 0) return sel;

  let lastSemantic = -1;
  for (let i = 0; i < parts.length; i++) {
    if (SEMANTIC_TAGS.has(tagFromSegment(parts[i]))) lastSemantic = i;
  }
  if (lastSemantic >= 0) {
    return parts.slice(0, lastSemantic + 1).join(" > ");
  }

  for (const seg of parts) {
    if (!GENERIC_WRAPPERS.has(tagFromSegment(seg))) return seg;
  }
  return parts[0];
}

/**
 * Count unique element groups across breakpoints. Groups changes by
 * top-level selector so multiple property changes on the same element
 * (e.g. margin-left + margin-right + shift + resize) count as 1.
 */
export function countUniqueSemanticChanges(
  changesPerBreakpoint: Iterable<SemanticChange[] | undefined>,
): number {
  const seen = new Set<string>();
  for (const changes of changesPerBreakpoint) {
    if (!changes) continue;
    for (const c of changes) seen.add(topLevelSelector(c.selector));
  }
  return seen.size;
}
