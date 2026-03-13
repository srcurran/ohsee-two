import type { ChangeCategory, ChangeSeverity, Report } from "./types";

/**
 * Category colors for semantic diff markers.
 * Used as inline styles (not Tailwind classes) because they're dynamically applied.
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

/**
 * Full category config including labels and icons.
 * Used by ChangeList for filter pills and entry icons.
 */
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
 * Severity border Tailwind classes for ChangeList entries.
 * References CSS variable tokens from globals.css.
 */
export const SEVERITY_BORDER_CLASSES: Record<ChangeSeverity, string> = {
  error: "border-l-severity-error",
  warning: "border-l-accent-yellow",
  info: "border-l-severity-info",
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
 * Returns the Tailwind class for a report status dot.
 */
export function reportDotColor(r: Report): string {
  if (r.status === "running") return "bg-status-running animate-pulse";
  if (r.status === "failed" || r.status === "cancelled") return "bg-status-inactive";
  return getReportTotalChanges(r) > 0 ? "bg-accent-yellow" : "bg-accent-green";
}
