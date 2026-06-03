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

/** Page-tile thumbnail with a shimmer placeholder shown until the image is
 *  paint-ready. Report thumbnails are very tall PNGs (~1024×10000px); the
 *  browser fires `load` before it has decoded them, so a plain <img> flashes
 *  a blank box. The <img> is always mounted (so `decode()` can run on the
 *  real element); the skeleton sits on top of it until that decode resolves. */
function PageTileThumb({
  thumbSrc,
  alt,
}: {
  thumbSrc: string | null;
  alt: string;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!thumbSrc) return;
    setReady(false);
    const img = imgRef.current;
    if (!img) return;
    let cancelled = false;
    const settle = () => {
      if (!cancelled) setReady(true);
    };
    // decode() resolves once the element is decoded and safe to paint
    // without a flash; it rejects on a decode error — reveal the <img>
    // anyway so the browser can show its own broken-image state.
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
      {!ready && (
        <div className="page-tile__thumb-skeleton" aria-hidden="true" />
      )}
      <img
        ref={imgRef}
        src={thumbSrc}
        alt={alt}
        className="page-tile__thumb-img"
        decoding="async"
      />
    </div>
  );
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
    const hasScreenshot = !!bpResult?.prodScreenshot;

    // Total unique changes across every breakpoint for this page. Counting
    // per active-bp would make the badge jump around as the user switches
    // viewports even though the underlying issue list is the same — this
    // matches the detail panel's header badge and the Detected Changes list.
    const bpData =
      activeVariant && page.variants?.[activeVariant]
        ? page.variants[activeVariant]
        : page.breakpoints;
    const uniqueKeys = new Set<string>();
    for (const r of Object.values(bpData)) {
      for (const c of r.semanticChanges ?? []) uniqueKeys.add(changeGroupKey(c));
    }
    const changeCount = uniqueKeys.size;

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
        <PageTileThumb thumbSrc={thumbSrc} alt={page.stepLabel || page.path} />
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

  return (
    <>
      {hasPages && (
        <div className={`page-grid-wrap stack stack--2xl${isRunning ? " page-grid-wrap--running" : ""}`}>
          {isRunning && <div className="page-grid-wrap__scrim" />}
          <div className="page-grid">
            {report.pages.map((page, i) => renderPageCard(page, i))}
          </div>
        </div>
      )}

      {/* While a capture runs, a spinner is pinned to the viewport centre
          so it stays put rather than riding the bottom of the growing grid. */}
      {isRunning && (
        <div className="loader-centered loader-centered--overlay">
          <div className="loader-spinner" />
          <p className="loader-text">Capturing…</p>
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
