import type { Report, ReportPage, BreakpointResult } from "@/lib/types";
import type { BpChangeStats } from "@/components/index/utils/report";

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

/** Per-breakpoint change stats for a single page. Breakpoints without valid
 * data (changeCount < 0) are omitted so the tab shows no badge. */
export function computeBpChangeCounts(
  data: Record<string, BreakpointResult>,
): Record<string, BpChangeStats> {
  const stats: Record<string, BpChangeStats> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val.changeCount < 0) continue;
    const n = val.semanticChanges?.length ?? 0;
    stats[key] = {
      changed: n > 0 ? 1 : 0,
      total: 1,
      changeCount: n,
    };
  }
  return stats;
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
