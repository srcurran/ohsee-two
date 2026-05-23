/** Pure helpers and constants for the PageDetailPanel overlay. URL
 * resolution, page-label formatting, and reductions over `report.pages` to
 * derive breakpoint / variant lists. No React, no DOM. */

import type {
  BreakpointResult,
  Report,
  ReportPage,
} from "@/lib/types";
import type { BpChangeStats } from "@/components/index/utils/report";

// Equal gutters all sides.
export const PANEL = { top: 28, right: 28, bottom: 28, left: 28 };
export const ANIM_MS = 300;
export const ANIM_EASE = "cubic-bezier(0.2, 0, 0, 1)";
export const CONTENT_FADE_MS = 150;
export const CONTENT_DELAY_MS = ANIM_MS;
export const EXIT_MS = 150;

/**
 * Resolve the URL to display for a page. Prefers the URL Playwright actually
 * captured (persisted on the breakpoint result), falling back to constructing
 * one from the project base URL + path. Construction only works for normal
 * pages — flow/composition steps store a label like "Flow > Step" in `path`,
 * so we leave the URL blank rather than render a broken concatenation.
 */
export function resolvePageUrl(
  page: ReportPage,
  bpResult: BreakpointResult | undefined,
  baseUrl: string,
  side: "prod" | "dev",
): string {
  const captured = side === "prod" ? bpResult?.prodUrl : bpResult?.devUrl;
  if (captured) return captured;
  if (page.flowId) return "";
  const trimmed = baseUrl.replace(/\/$/, "");
  return `${trimmed}${page.path === "/" ? "" : page.path}`;
}

/** Display label for a page — step label for flow steps, "index" for "/",
 * otherwise the full path (leading slash kept so the label matches how the
 * page appears in the report-grid card). */
export function getPageLabel(page: ReportPage): string {
  return page.stepLabel
    ? page.stepLabel
    : page.path === "/"
      ? "index"
      : page.path;
}

/** Sorted union of every breakpoint width that appears in any page of the
 * report. */
export function collectReportBreakpoints(report: Report): number[] {
  const bpSet = new Set<number>();
  for (const page of report.pages) {
    for (const bp of Object.keys(page.breakpoints)) bpSet.add(Number(bp));
  }
  return [...bpSet].sort((a, b) => a - b);
}

/** Variant ids seen on any page of the report, in insertion order. */
export function collectReportVariants(report: Report): string[] {
  const variantIds = new Set<string>();
  for (const page of report.pages) {
    if (page.variants) {
      for (const vid of Object.keys(page.variants)) variantIds.add(vid);
    }
  }
  return [...variantIds];
}

/** Per-breakpoint change stats for a single page. Breakpoints without a
 * prod screenshot are omitted so the tab shows no badge. */
export function computeBpChangeCounts(
  activeBpData: Record<string, BreakpointResult>,
): Record<string, BpChangeStats> {
  const stats: Record<string, BpChangeStats> = {};
  for (const [key, val] of Object.entries(activeBpData)) {
    if (!val.prodScreenshot) continue;
    const n = val.semanticChanges?.length ?? 0;
    stats[key] = {
      changed: n > 0 ? 1 : 0,
      total: 1,
      changeCount: n,
    };
  }
  return stats;
}
