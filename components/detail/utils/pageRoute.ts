import type { Report, ReportPage, BreakpointResult } from "@/lib/types";

/** Human-readable label for a page: explicit step label > index > path. */
export function formatPageName(page: ReportPage): string {
  if (page.stepLabel) return page.stepLabel;
  if (page.path === "/") return "index";
  return page.path.replace(/^\//, "");
}

/** Picks the variant's breakpoint map when a variant is active and has data
 * for this page; otherwise falls back to the page's default breakpoints. */
export function getActiveBpData(
  page: ReportPage,
  activeVariant: string | null,
): Record<string, BreakpointResult> {
  return activeVariant && page.variants?.[activeVariant]
    ? page.variants[activeVariant]
    : page.breakpoints;
}

/** Per-breakpoint change count: -1 sentinel survives so the tab can render a
 * failure dot, otherwise we count semanticChanges (not the raw pixel count). */
export function computeBpChangeCounts(
  data: Record<string, BreakpointResult>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(data)) {
    out[key] = val.changeCount < 0 ? -1 : (val.semanticChanges?.length ?? 0);
  }
  return out;
}

/** Union of variant ids across all pages of a report (order: first-seen). */
export function getReportVariants(report: Report): string[] {
  const ids = new Set<string>();
  for (const page of report.pages) {
    if (page.variants) {
      for (const vid of Object.keys(page.variants)) ids.add(vid);
    }
  }
  return Array.from(ids);
}
