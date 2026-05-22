/** The main thumbnail grid below the report header: regular pages first,
 * then one section per flow. Each tile is a button that opens the page
 * overlay (the parent supplies the click handler so it can capture the
 * tile's bounding rect for the open animation). Empty/loading/failed
 * fallbacks for the zero-page case live here too, since they only ever
 * render in place of this grid. */

import { memo, useEffect, useRef, useState } from "react";
import ChangeBadge from "@/components/index/ChangeBadge";
import type { Report, ReportPage, SemanticChange } from "@/lib/types";
import { getPageBp } from "@/components/index/utils/report";
import { topLevelSelector, changeGroupKey } from "@/lib/change-identity";

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
    const changeCount = bpResult?.semanticChanges
      ? new Set(bpResult.semanticChanges.map((c) => topLevelSelector(c.selector))).size
      : 0;
    const hasScreenshot = !!bpResult?.prodScreenshot;

    // Split the change count into universal (appears at all breakpoints) vs
    // breakpoint-specific, using the coarse group key for matching.
    // Each selector group is counted exactly once — it's "universal" only
    // if ALL its changes are universal, otherwise "specific".
    const bpData = activeVariant && page.variants?.[activeVariant]
      ? page.variants[activeVariant]
      : page.breakpoints;
    const bpsWithSemantic = Object.values(bpData).filter(
      (r) => r.semanticChanges !== undefined,
    );
    let universalCount = 0;
    let specificCount = 0;
    if (bpResult?.semanticChanges && bpsWithSemantic.length > 1) {
      // Build key → bp count across ALL breakpoints
      const keyToBpCount = new Map<string, number>();
      for (const r of bpsWithSemantic) {
        const seen = new Set<string>();
        for (const c of r.semanticChanges!) {
          const k = changeGroupKey(c);
          if (!seen.has(k)) { seen.add(k); keyToBpCount.set(k, (keyToBpCount.get(k) ?? 0) + 1); }
        }
      }
      const totalBps = bpsWithSemantic.length;
      // Group by top-level selector, then classify the whole group.
      // A group is "universal" only if EVERY change in it is universal.
      // If any change is breakpoint-specific, the group is "specific".
      const selectorBucket = new Map<string, boolean>(); // true = all universal so far
      for (const c of bpResult.semanticChanges) {
        const top = topLevelSelector(c.selector);
        const k = changeGroupKey(c);
        const isUniversal = (keyToBpCount.get(k) ?? 0) >= totalBps;
        const prev = selectorBucket.get(top);
        selectorBucket.set(top, prev === undefined ? isUniversal : prev && isUniversal);
      }
      for (const allUniversal of selectorBucket.values()) {
        if (allUniversal) universalCount++;
        else specificCount++;
      }
    } else {
      // Single breakpoint or no semantic data — all counts are "universal"
      universalCount = changeCount;
    }
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
        <PageTileThumb thumbSrc={thumbSrc} alt={page.stepLabel || page.path} />
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
          <ChangeBadge
            count={changeCount}
            universalCount={universalCount}
            specificCount={specificCount}
            noData={!hasScreenshot}
          />
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

      {/* While a capture runs, a centered spinner sits at the growing edge
          of the grid (or fills the area before the first page lands). */}
      {isRunning && (
        <div className="loader-centered">
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
