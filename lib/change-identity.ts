import type { SemanticChange } from "./types";

/**
 * Coarser identity that ignores prod/dev values so the same logical change
 * (e.g. "width changed on .hero") matches across breakpoints even when the
 * specific values differ (1360→1240 at 1440px vs 900→800 at 1024px).
 */
export function changeGroupKey(change: SemanticChange): string {
  return `${change.selector}::${change.category}::${change.details?.property ?? ""}`;
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
