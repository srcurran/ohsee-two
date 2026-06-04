import type { ChangeCategory, ChangeSeverity, Report } from "./types";
import { changeGroupKey } from "./change-identity";

/**
 * Category colors for semantic diff markers.
 * Used as inline styles because they're dynamically applied per category.
 */
export const CATEGORY_COLORS: Record<ChangeCategory, string> = {
  layout: "#cc4444",
  spacing: "#cc7777",
  alignment: "#aa55cc",
  typography: "#7777aa",
  color: "#55aa77",
  content: "#cc4444",
  visibility: "#cc4444",
  border: "#aa8855",
  structural: "#cc4444",
};

/** Default fallback when category is unknown */
export const CATEGORY_COLOR_FALLBACK = "#cc4444";

export const CATEGORY_CONFIG: Record<
  ChangeCategory,
  { label: string; icon: string; color: string }
> = {
  layout: { label: "Layout", icon: "⊞", color: CATEGORY_COLORS.layout },
  spacing: { label: "Spacing", icon: "↔", color: CATEGORY_COLORS.spacing },
  alignment: { label: "Alignment", icon: "☰", color: CATEGORY_COLORS.alignment },
  typography: { label: "Typography", icon: "Aa", color: CATEGORY_COLORS.typography },
  color: { label: "Color", icon: "◉", color: CATEGORY_COLORS.color },
  content: { label: "Content", icon: "✎", color: CATEGORY_COLORS.content },
  visibility: { label: "Visibility", icon: "◐", color: CATEGORY_COLORS.visibility },
  border: { label: "Border", icon: "─", color: CATEGORY_COLORS.border },
  structural: { label: "Structural", icon: "±", color: CATEGORY_COLORS.structural },
};

/**
 * BEM modifier suffix for change-entry severity — maps to .change-entry--{mod}.
 */
export const SEVERITY_CSS_MODIFIERS: Record<ChangeSeverity, string> = {
  error: "error",
  warning: "error",
  info: "info",
};

/**
 * Calculate total change count across all pages + breakpoints in a report.
 */
export function getReportTotalChanges(r: Report): number {
  return r.pages.reduce(
    (sum, page) =>
      sum +
      Object.values(page.breakpoints).reduce(
        (s, bp) => s + (bp.changeCount || 0),
        0
      ),
    0
  );
}

/**
 * Like getReportTotalChanges but ignores changes the user has accepted, so a
 * report whose every diff has been reviewed reads as having none left. Falls
 * back to the raw changeCount for breakpoints with no semantic change list
 * (e.g. pixel-only diffs, which can't be accepted individually).
 */
export function getReportActiveChanges(r: Report, accepted: Set<string>): number {
  if (accepted.size === 0) return getReportTotalChanges(r);
  let total = 0;
  for (const page of r.pages) {
    for (const bp of Object.values(page.breakpoints)) {
      const changes = bp.semanticChanges;
      if (changes && changes.length > 0) {
        for (const c of changes) {
          if (!accepted.has(`${r.id}::${changeGroupKey(c)}`)) total++;
        }
      } else {
        total += bp.changeCount || 0;
      }
    }
  }
  return total;
}

/**
 * BEM modifier suffix for a report status dot — used as `.status-dot--{mod}`.
 * Pass `accepted` (the per-browser accepted-changes set) to make the dot go
 * green once every diff has been accepted, even though the report still
 * technically contains them.
 */
export function reportDotModifier(
  r: Report,
  accepted?: Set<string>,
): "running" | "inactive" | "warning" | "success" {
  if (r.status === "running") return "running";
  if (r.status === "failed" || r.status === "cancelled") return "inactive";
  const changes = accepted ? getReportActiveChanges(r, accepted) : getReportTotalChanges(r);
  return changes > 0 ? "warning" : "success";
}
