/** Pure helpers for the report overview page. Kept React-free so they can
 * be reused by sub-components (page grid, header) without circular imports
 * back through the shell. */

import type { Report, ReportPage, BreakpointResult } from "@/lib/types";

/** Host name (sans `www.`) from a URL, with raw fallback for bad inputs. */
export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Union of every breakpoint key that appears on any page in the report,
 * numeric-sorted ascending. */
export function computeReportBreakpoints(report: Report): number[] {
  const bpSet = new Set<number>();
  for (const page of report.pages) {
    for (const bp of Object.keys(page.breakpoints)) bpSet.add(Number(bp));
  }
  return [...bpSet].sort((a, b) => a - b);
}

/** Variants present across the report's pages — order is insertion order
 * from `Object.keys`, matching the original implementation. */
export function computeReportVariants(report: Report | null): string[] {
  if (!report) return [];
  const ids = new Set<string>();
  for (const page of report.pages) {
    if (page.variants) {
      for (const vid of Object.keys(page.variants)) ids.add(vid);
    }
  }
  return Array.from(ids);
}

/** Resolves the active breakpoint: prefer the URL value when it exists in
 * the report, else fall back to the closest available to 1024px (a desktop
 * default) so tiles always render. */
export function pickActiveBp(
  bpParam: number | null,
  reportBreakpoints: number[],
): number {
  if (bpParam && reportBreakpoints.includes(bpParam)) return bpParam;
  if (reportBreakpoints.length === 0) return bpParam ?? 1024;
  let best = reportBreakpoints[0];
  let bestDist = Math.abs(best - 1024);
  for (const bp of reportBreakpoints) {
    const d = Math.abs(bp - 1024);
    if (d < bestDist) {
      best = bp;
      bestDist = d;
    }
  }
  return best;
}

export interface BpChangeStats {
  changed: number;
  total: number;
}

/** Per-breakpoint change stats: how many pages have changes vs total pages. */
export function computeBpChangeCounts(
  reportOrBpData: Report | Record<string, BreakpointResult>,
  activeVariant?: string | null,
): Record<string, BpChangeStats> {
  const stats: Record<string, BpChangeStats> = {};

  if ("pages" in reportOrBpData && Array.isArray((reportOrBpData as Report).pages)) {
    const report = reportOrBpData as Report;
    for (const page of report.pages) {
      const bpData =
        activeVariant && page.variants?.[activeVariant]
          ? page.variants[activeVariant]
          : page.breakpoints;
      for (const [bp, result] of Object.entries(bpData)) {
        if (!stats[bp]) stats[bp] = { changed: 0, total: 0 };
        stats[bp].total++;
        if ((result.semanticChanges?.length ?? 0) > 0) stats[bp].changed++;
      }
    }
  } else {
    for (const [bp, result] of Object.entries(reportOrBpData)) {
      stats[bp] = {
        changed: (result.semanticChanges?.length ?? 0) > 0 ? 1 : 0,
        total: 1,
      };
    }
  }

  return stats;
}

/** Per-page breakpoint result — falls through the variant map when one is
 * active, else hits the page's default breakpoints. */
export function getPageBp(
  page: ReportPage,
  bp: string,
  activeVariant: string | null,
) {
  if (activeVariant && page.variants?.[activeVariant]) {
    return page.variants[activeVariant][bp];
  }
  return page.breakpoints[bp];
}

/** Splits the report's pages into the regular grid and the per-flow
 * sections. Flow grouping preserves first-seen order via the Map. */
export function groupPagesByFlow(report: Report) {
  const regularPages = report.pages.filter((p) => !p.flowId);
  const flowPages = report.pages.filter((p) => p.flowId);

  const flowGroups = new Map<string, ReportPage[]>();
  for (const fp of flowPages) {
    const group = flowGroups.get(fp.flowId!) || [];
    group.push(fp);
    flowGroups.set(fp.flowId!, group);
  }

  return { regularPages, flowGroups };
}
