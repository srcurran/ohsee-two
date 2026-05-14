/** The main thumbnail grid below the report header: regular pages first,
 * then one section per flow. Each tile is a button that opens the page
 * overlay (the parent supplies the click handler so it can capture the
 * tile's bounding rect for the open animation). Empty/loading/failed
 * fallbacks for the zero-page case live here too, since they only ever
 * render in place of this grid. */

import { memo, useMemo } from "react";
import ChangeBadge from "@/components/index/ChangeBadge";
import type { Report, ReportPage } from "@/lib/types";
import { getPageBp, groupPagesByFlow } from "@/components/index/utils/report";

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
  // groupPagesByFlow walks every page in the report; memoize so the grid
  // doesn't re-walk it when only the active breakpoint/variant changes.
  const { regularPages, flowGroups } = useMemo(
    () => groupPagesByFlow(report),
    [report],
  );

  const renderPageCard = (page: ReportPage, index: number) => {
    const bpResult = getPageBp(page, String(activeBp), activeVariant);
    const changeCount = bpResult?.semanticChanges?.length ?? 0;
    const hasScreenshot = !!bpResult?.prodScreenshot;
    const diffSrc = bpResult?.diffScreenshot
      ? `/api/screenshots/${bpResult.diffScreenshot}`
      : null;

    return (
      <button
        key={page.id}
        onClick={(e) => onOpenPage(page.pageId, e)}
        className="page-tile animate-card-in"
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <div className="page-tile__thumb page-tile__thumb--center">
          {diffSrc ? (
            <img
              src={diffSrc}
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
          <span className="page-tile__label">
            {page.stepLabel || page.path}
          </span>
          <ChangeBadge count={changeCount} noData={!hasScreenshot} />
        </div>
      </button>
    );
  };

  return (
    <>
      {regularPages.length > 0 && (
        <div className="page-grid">
          {regularPages.map((page, i) => renderPageCard(page, i))}
        </div>
      )}

      {Array.from(flowGroups.entries()).map(([flowId, pages]) => {
        const flowName = pages[0]?.path.split(" > ")[0] || "Flow";
        return (
          <div key={flowId} className="report__flow-section">
            <div className="report__flow-header">
              <span className="badge badge--flow">Flow</span>
              <h3 className="report__flow-title">{flowName}</h3>
            </div>
            <div className="page-grid">
              {pages.map((page, i) =>
                renderPageCard(page, regularPages.length + i),
              )}
            </div>
          </div>
        );
      })}

      {report.pages.length === 0 && report.status === "running" && (
        <div className="loader-centered">
          <div className="loader-spinner" />
          <p className="loader-text">Capturing screenshots...</p>
        </div>
      )}

      {report.pages.length === 0 && report.status === "failed" && (
        <p className="loader-text" style={{ textAlign: "center" }}>
          No pages were processed before the report failed.
        </p>
      )}

      {report.pages.length === 0 && report.status === "completed" && (
        <p className="loader-text" style={{ textAlign: "center" }}>
          No pages in this report.
        </p>
      )}
    </>
  );
}

export const ReportPageGrid = memo(ReportPageGridComponent);
ReportPageGrid.displayName = "ReportPageGrid";
