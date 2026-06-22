/** The main thumbnail grid below the report header: regular pages first,
 * then one section per flow. Each tile is a button that opens the page
 * overlay (the parent supplies the click handler so it can capture the
 * tile's bounding rect for the open animation). Empty/loading/failed
 * fallbacks for the zero-page case live here too, since they only ever
 * render in place of this grid. */

import { memo, useEffect, useRef, useState } from "react";
import ChangeBadge from "@/components/utility/ChangeBadge";
import type { Report, ReportPage } from "@/lib/types";
import { getPageBp } from "@/components/index/utils/report";
import { changeGroupKey } from "@/lib/change-identity";
import { useAcceptedChanges, acceptedChangeKey } from "@/lib/accepted-changes";
import { formatDuration } from "@/lib/relative-time";
import { useBreakpointCrossfade } from "@/components/utility/useBreakpointCrossfade";
import type { ReportFilterMode } from "@/components/index/use/reportUrlState";

/** Page-tile thumbnail. Report thumbnails are very tall PNGs (~1024×10000px);
 *  the browser fires `load` before it has decoded them, and changing the src
 *  keeps painting the *previous* thumbnail until the new one decodes. So the
 *  <img> is held hidden (showing the thumb's neutral background) until the
 *  current source has decoded, then cross-faded in — otherwise a breakpoint
 *  switch briefly shows the old thumbnail fading back in. */
function PageTileThumb({
  thumbSrc,
  alt,
  switching,
}: {
  thumbSrc: string | null;
  alt: string;
  switching: boolean;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  // Derive readiness from the decoded source rather than a flag toggled in an
  // effect — a boolean would lag one render behind the src swap, long enough
  // for the stale "ready" to fade the old thumbnail back in.
  const [decodedSrc, setDecodedSrc] = useState<string | null>(null);
  const ready = !!thumbSrc && decodedSrc === thumbSrc;

  useEffect(() => {
    if (!thumbSrc) return;
    const img = imgRef.current;
    if (!img) return;
    let cancelled = false;
    const settle = () => {
      if (!cancelled) setDecodedSrc(thumbSrc);
    };
    // decode() resolves once the element is decoded and safe to paint; it
    // rejects on a decode error — reveal anyway so the browser can show its
    // own broken-image state.
    img.decode().then(settle).catch(settle);
    return () => {
      cancelled = true;
    };
  }, [thumbSrc]);

  if (!thumbSrc) {
    return (
      <div className="page-tile__thumb">
        <div className="page-tile__thumb-empty">No screenshot</div>
      </div>
    );
  }

  return (
    <div className="page-tile__thumb">
      {/* Inner layer cross-fades on breakpoint switch (shared with the detail
          panel). Hidden through the fade-out AND until the swapped-in
          thumbnail has decoded, so the new image — not the old one — fades in;
          the thumb's neutral background shows through meanwhile. */}
      <div
        className={`bp-crossfade${switching || !ready ? " bp-crossfade--switching" : ""}`}
      >
        <img
          ref={imgRef}
          src={thumbSrc}
          alt={alt}
          className="page-tile__thumb-img"
          decoding="async"
        />
      </div>
    </div>
  );
}

interface ReportPageGridProps {
  report: Report;
  activeBp: number;
  activeVariant: string | null;
  filterMode: ReportFilterMode;
  onOpenPage: (pageId: string, e?: React.MouseEvent) => void;
}

function ReportPageGridComponent({
  report,
  activeBp,
  activeVariant,
  filterMode,
  onOpenPage,
}: ReportPageGridProps) {
  const { accepted } = useAcceptedChanges();

  // Cross-fade the thumbnails when the breakpoint changes — same transition as
  // the detail panel. `displayedBp` lags `activeBp` so the outgoing thumbnails
  // fade out before the sources swap; `switching` drives the fade on each tile.
  const { displayedBp, switching } = useBreakpointCrossfade(activeBp);

  // Total unique (unaccepted) changes across every breakpoint for a page.
  // Counting per active-bp would make the badge jump around as the user
  // switches viewports even though the underlying issue list is the same —
  // this matches the detail panel's header badge and the Detected Changes
  // list, and drives both the card badge and the "Changes only" filter.
  const pageChangeCount = (page: ReportPage): number => {
    const bpData =
      activeVariant && page.variants?.[activeVariant]
        ? page.variants[activeVariant]
        : page.breakpoints;
    const uniqueKeys = new Set<string>();
    for (const r of Object.values(bpData)) {
      for (const c of r.semanticChanges ?? []) {
        if (!accepted.has(acceptedChangeKey(report.id, c))) uniqueKeys.add(changeGroupKey(c));
      }
    }
    return uniqueKeys.size;
  };

  const renderPageCard = (page: ReportPage, index: number) => {
    const bpResult = getPageBp(page, String(displayedBp), activeVariant);
    const hasScreenshot = !!bpResult?.prodScreenshot;
    const changeCount = pageChangeCount(page);

    // Prefer the highlight image (prod with changed pixels tinted) when
    // available — it gives an at-a-glance view of what changed. Falls
    // back to the plain prod screenshot for zero-change pages or older
    // reports that don't have a highlight image.
    const thumbSrc = bpResult?.highlightScreenshot
      ? `/api/screenshots/${bpResult.highlightScreenshot}`
      : bpResult?.prodScreenshot
        ? `/api/screenshots/${bpResult.prodScreenshot}`
        : null;

    return (
      <button
        key={page.id}
        onClick={(e) => onOpenPage(page.pageId, e)}
        className="page-tile animate-card-in"
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <PageTileThumb thumbSrc={thumbSrc} alt={page.stepLabel || page.path} switching={switching} />
        <div className="page-tile__footer">
          <div className="page-tile__footer-text">
            <span className="page-tile__label">
              {page.stepLabel || page.path}
            </span>
          </div>
          <ChangeBadge count={changeCount} noData={!hasScreenshot} />
        </div>
      </button>
    );
  };

  const isRunning = report.status === "running";
  const hasPages = report.pages.length > 0;
  // The "Changes only" filter never applies mid-run — the grid is partial and
  // covered by the capture scrim, so show everything captured so far.
  const visiblePages =
    !isRunning && filterMode === "changes"
      ? report.pages.filter((p) => pageChangeCount(p) > 0)
      : report.pages;
  const hasVisible = visiblePages.length > 0;

  return (
    <>
      {hasVisible && (
        <div className={`page-grid-wrap stack stack--2xl${isRunning ? " page-grid-wrap--running" : ""}`}>
          {isRunning && <div className="page-grid-wrap__scrim" />}
          <div className="page-grid">
            {visiblePages.map((page, i) => renderPageCard(page, i))}
          </div>
        </div>
      )}

      {/* Run duration, quietly noted at the end of the grid — for comparing
          fast mode vs normal without cluttering the header. */}
      {!isRunning && hasVisible && report.completedAt && (
        <p className="page-grid__duration">
          Ran in {formatDuration(report.createdAt, report.completedAt)}
        </p>
      )}

      {/* While a capture runs, a spinner is pinned to the viewport centre
          so it stays put rather than riding the bottom of the growing grid. */}
      {isRunning && (
        <div className="loader-centered loader-centered--overlay">
          <div className="loader-spinner" />
          <p className="loader-text">Capturing…</p>
        </div>
      )}

      {/* Pages exist, but the "Changes only" filter hid them all. */}
      {!isRunning && hasPages && !hasVisible && filterMode === "changes" && (
        <p className="loader-text" style={{ textAlign: "center" }}>
          No pages with changes.
        </p>
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
