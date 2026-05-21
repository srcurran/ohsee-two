/** The main thumbnail grid below the report header: regular pages first,
 * then one section per flow. Each tile is a button that opens the page
 * overlay (the parent supplies the click handler so it can capture the
 * tile's bounding rect for the open animation). Empty/loading/failed
 * fallbacks for the zero-page case live here too, since they only ever
 * render in place of this grid. */

import { memo } from "react";
import ChangeBadge from "@/components/index/ChangeBadge";
import type { Report, ReportPage, SemanticChange } from "@/lib/types";
import { getPageBp } from "@/components/index/utils/report";
import { topLevelSelector } from "@/lib/change-identity";

/** Short labels for category tags on page cards. */
const CATEGORY_LABELS: Record<string, string> = {
  structural: "DOM",
  layout: "layout",
  typography: "type",
  color: "color",
  content: "text",
  spacing: "spacing",
  alignment: "align",
  visibility: "vis",
  border: "border",
};

/** Build a concise summary of change categories for the card footer.
 *  Groups by top-level selector first (so multiple property changes on
 *  the same element count once), then counts per category. Returns
 *  entries sorted by count descending, capped at 3 tags. */
function summarizeChanges(
  changes: SemanticChange[] | undefined,
): { label: string; count: number }[] {
  if (!changes || changes.length === 0) return [];
  // Dedupe by top-level selector per category so the counts are
  // meaningful (3 layout changes on the same nav = 1 "layout" hit).
  const catSelectors = new Map<string, Set<string>>();
  for (const c of changes) {
    const cat = c.category;
    const top = topLevelSelector(c.selector);
    let set = catSelectors.get(cat);
    if (!set) { set = new Set(); catSelectors.set(cat, set); }
    set.add(top);
  }
  const entries = Array.from(catSelectors.entries())
    .map(([cat, selectors]) => ({
      label: CATEGORY_LABELS[cat] ?? cat,
      count: selectors.size,
    }))
    .sort((a, b) => b.count - a.count);
  return entries.slice(0, 3);
}

interface ReportPageGridProps {
  report: Report;
  activeBp: number;
  activeVariant: string | null;
  onOpenPage: (pageId: string, e?: React.MouseEvent) => void;
}

function ReportPageGridComponent({
  report,
  activeBp,
  activeVariant,
  onOpenPage,
}: ReportPageGridProps) {
  const renderPageCard = (page: ReportPage, index: number) => {
    const bpResult = getPageBp(page, String(activeBp), activeVariant);
    const changeCount = bpResult?.semanticChanges
      ? new Set(bpResult.semanticChanges.map((c) => topLevelSelector(c.selector))).size
      : 0;
    const hasScreenshot = !!bpResult?.prodScreenshot;
    // Prefer the highlight image (prod with changed pixels tinted) when
    // available — it gives an at-a-glance view of what changed. Falls
    // back to the plain prod screenshot for zero-change pages or older
    // reports that don't have a highlight image.
    const thumbSrc = bpResult?.highlightScreenshot
      ? `/api/screenshots/${bpResult.highlightScreenshot}`
      : bpResult?.prodScreenshot
        ? `/api/screenshots/${bpResult.prodScreenshot}`
        : null;
    const tags = summarizeChanges(bpResult?.semanticChanges);

    return (
      <button
        key={page.id}
        onClick={(e) => onOpenPage(page.pageId, e)}
        className="page-tile animate-card-in"
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <div className="page-tile__thumb page-tile__thumb--center">
          {thumbSrc ? (
            <img
              src={thumbSrc}
              alt={page.stepLabel || page.path}
              className="page-tile__thumb-img page-tile__thumb-img--clamped"
              style={{ maxWidth: activeBp }}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="page-tile__thumb-empty">No screenshot</div>
          )}
        </div>
        <div className="page-tile__footer">
          <div className="page-tile__footer-text">
            <span className="page-tile__label">
              {page.stepLabel || page.path}
            </span>
            {tags.length > 0 && (
              <div className="page-tile__tags">
                {tags.map((t) => (
                  <span key={t.label} className="page-tile__tag">
                    {t.count} {t.label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <ChangeBadge count={changeCount} noData={!hasScreenshot} />
        </div>
      </button>
    );
  };

  const isRunning = report.status === "running";
  const hasPages = report.pages.length > 0;

  return (
    <>
      {hasPages && (
        <div className={`page-grid-wrap${isRunning ? " page-grid-wrap--running" : ""}`}>
          {isRunning && <div className="page-grid-wrap__scrim" />}
          <div className="page-grid">
            {report.pages.map((page, i) => renderPageCard(page, i))}
          </div>
        </div>
      )}

      {!hasPages && !isRunning && (
        <>
          {report.status === "failed" && (
            <p className="loader-text" style={{ textAlign: "center" }}>
              No pages were processed before the report failed.
            </p>
          )}

          {report.status === "completed" && (
            <p className="loader-text" style={{ textAlign: "center" }}>
              No pages in this report.
            </p>
          )}
        </>
      )}
    </>
  );
}

export const ReportPageGrid = memo(ReportPageGridComponent);
ReportPageGrid.displayName = "ReportPageGrid";
