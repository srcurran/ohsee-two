/** The main thumbnail grid below the report header: regular pages first,
 * then one section per flow. Each tile is a button that opens the page
 * overlay (the parent supplies the click handler so it can capture the
 * tile's bounding rect for the open animation). Empty/loading/failed
 * fallbacks for the zero-page case live here too, since they only ever
 * render in place of this grid. */

import { memo } from "react";
import ChangeBadge from "@/components/index/ChangeBadge";
import type { Report, ReportPage } from "@/lib/types";
import { getPageBp } from "@/components/index/utils/report";
import { topLevelSelector } from "@/lib/change-identity";

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
    const thumbSrc = bpResult?.prodScreenshot
      ? `/api/screenshots/${bpResult.prodScreenshot}`
      : null;

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
          <span className="page-tile__label">
            {page.stepLabel || page.path}
          </span>
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
          <div className="page-grid">
            {report.pages.map((page, i) => renderPageCard(page, i))}
          </div>
        </div>
      )}

      {isRunning && (
        <>
          <div className="page-grid-wrap__scrim" />
          <div className="page-grid-wrap__indicator">
            <div className="loader-spinner loader-spinner--sm" />
            <p className="loader-text">Capturing...</p>
          </div>
        </>
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
