"use client";

import { useMemo, useRef, useState } from "react";
import BreakpointTabs from "@/components/index/BreakpointTabs";
import VariantTabs from "@/components/index/VariantTabs";
import TabBar from "@/components/utility/TabBar";
import SliderComparison from "@/components/detail/SliderComparison";
import type { Project, Report, ReportPage, SemanticChange } from "@/lib/types";
import type { ReportFilterMode } from "@/components/index/use/reportUrlState";
import { changeGroupKey } from "@/lib/change-identity";
import { PageDetailHeader } from "@/components/detail/PageDetailHeader";
import { PageDetailViewToggle } from "@/components/detail/PageDetailViewToggle";
import { PageDetailChanges } from "@/components/detail/PageDetailChanges";
import { usePageDetailAnimation } from "@/components/detail/use/pageDetailAnimation";
import { usePageDetailViewMode } from "@/components/detail/use/pageDetailViewMode";
import { usePageDetailKeyboardNav } from "@/components/detail/use/pageDetailKeyboardNav";
import {
  ANIM_EASE,
  ANIM_MS,
  CONTENT_DELAY_MS,
  CONTENT_FADE_MS,
  EXIT_MS,
  collectReportBreakpoints,
  collectReportVariants,
  computeBpChangeCounts,
  getPageLabel,
  resolvePageUrl,
} from "@/components/detail/utils/pageDetail";
import { classifyChanges } from "@/components/detail/utils/changeScope";
import { useAcceptedChanges, activeChanges } from "@/lib/accepted-changes";

interface Props {
  report: Report;
  project: Project;
  pageId: string;
  initialBp: number;
  initialVariant: string | null;
  originRect?: DOMRect | null;
  originThumb?: { rect: DOMRect; src: string } | null;
  onClose: () => void;
  onNavigate: (pageId: string) => void;
  onBpChange: (bp: number) => void;
  onVariantChange: (variant: string | null) => void;
  /** Shared report-grid filter. "changes" makes prev/next/keyboard navigation
   *  skip pages with no unaccepted changes. */
  filterMode: ReportFilterMode;
  onFilterChange: (mode: ReportFilterMode) => void;
}

/** Top-level page-detail overlay shell. Composes the animation, view-mode,
 * and keyboard hooks with the header / view-toggle / changes child
 * components. Layout, sticky-toggle scaffold, and the scrim live here; all
 * non-trivial logic is delegated. */
export default function PageDetailPanel({
  report,
  project,
  pageId,
  initialBp,
  initialVariant,
  originRect,
  onClose,
  onNavigate,
  onBpChange,
  onVariantChange,
  filterMode,
  onFilterChange,
}: Props) {
  const [highlightedChangeId, setHighlightedChangeId] = useState<string | null>(
    null,
  );
  const [showingDev, setShowingDev] = useState(false);
  const [forceDevLocked, setForceDevLocked] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const activeBp = initialBp;
  const activeVariant = initialVariant;

  const { animState, handleClose, getPanelStyle } = usePageDetailAnimation({
    originRect,
    onClose,
  });

  const {
    viewMode,
    changeViewMode,
    diffMode,
    setDiffMode,
    scrollRef,
    screenshotRef,
  } = usePageDetailViewMode({ pageId });

  const { accepted } = useAcceptedChanges();

  // A page is navigable under the Changes-only filter when it still has at
  // least one unaccepted change (at the active variant) — the same rule the
  // report grid uses to decide which page cards to show.
  const pageHasChanges = (page: ReportPage) => {
    const bpData =
      activeVariant && page.variants?.[activeVariant]
        ? page.variants[activeVariant]
        : page.breakpoints;
    return Object.values(bpData).some(
      (r) => activeChanges(r.semanticChanges ?? [], report.id, accepted).length > 0,
    );
  };

  const currentIndex = report.pages.findIndex((p) => p.pageId === pageId);
  const currentPage = currentIndex >= 0 ? report.pages[currentIndex] : null;

  // Prev/next walk outward from the current page, skipping non-matching pages
  // when the Changes-only filter is on, so sequential navigation (arrows +
  // keyboard) mirrors the filtered grid. Works even when the current page
  // itself has no changes (e.g. the filter was toggled on while viewing it).
  const navigable = (page: ReportPage) =>
    filterMode !== "changes" || pageHasChanges(page);
  let prevPage: ReportPage | null = null;
  let nextPage: ReportPage | null = null;
  if (currentIndex >= 0) {
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (navigable(report.pages[i])) { prevPage = report.pages[i]; break; }
    }
    for (let i = currentIndex + 1; i < report.pages.length; i++) {
      if (navigable(report.pages[i])) { nextPage = report.pages[i]; break; }
    }
  }

  usePageDetailKeyboardNav({
    prevPage,
    nextPage,
    onNavigate,
    onClose: handleClose,
  });

  // `activeBpData` feeds the memoized tree walks below, so it must be
  // computed before the early return — fall back to an empty map when
  // there's no page yet. Memoized so it stays a stable dependency.
  const activeBpData = useMemo(
    () =>
      !currentPage
        ? {}
        : activeVariant && currentPage.variants?.[activeVariant]
          ? currentPage.variants[activeVariant]
          : currentPage.breakpoints,
    [currentPage, activeVariant],
  );

  // These walk the full report / page tree — memoize so they don't re-run
  // on every peek/hover state change inside the panel.
  // Accepted (expected) diffs are stripped from the count inputs so the header
  // badge AND the per-breakpoint deviation dots ignore them. The Detected
  // Changes list below still receives the full data (accepted entries stay
  // visible, styled as accepted).
  const activeBpDataForCounts = useMemo(() => {
    if (accepted.size === 0) return activeBpData;
    const out: typeof activeBpData = {};
    for (const [bp, r] of Object.entries(activeBpData)) {
      out[bp] = { ...r, semanticChanges: activeChanges(r.semanticChanges, report.id, accepted) };
    }
    return out;
  }, [activeBpData, accepted, report.id]);
  const bpChangeCounts = useMemo(
    () => computeBpChangeCounts(activeBpDataForCounts),
    [activeBpDataForCounts],
  );
  // Scope (universal vs specific) for the dots, computed from the same
  // accepted-filtered data so the dot colour stays consistent with its count.
  const dotScope = useMemo(() => classifyChanges(activeBpDataForCounts), [activeBpDataForCounts]);
  const reportBreakpoints = useMemo(
    () => collectReportBreakpoints(report),
    [report],
  );
  const reportVariants = useMemo(() => collectReportVariants(report), [report]);
  const changeScope = useMemo(
    () => classifyChanges(activeBpData),
    [activeBpData],
  );
  // Every detected change across every breakpoint, deduped by group key so a
  // change that appears at three viewports is one entry. Active-breakpoint
  // instances are preferred as the representative (so the description/y/
  // location match what the user can actually see). The Change list dims
  // entries whose breakpoint set doesn't include the current viewport.
  const crossBpChanges = useMemo<SemanticChange[]>(() => {
    const seen = new Set<string>();
    const out: SemanticChange[] = [];
    const activeStr = String(activeBp);
    for (const c of activeBpData[activeStr]?.semanticChanges ?? []) {
      const k = changeGroupKey(c);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(c);
      }
    }
    for (const [bp, r] of Object.entries(activeBpData)) {
      if (bp === activeStr) continue;
      for (const c of r.semanticChanges ?? []) {
        const k = changeGroupKey(c);
        if (!seen.has(k)) {
          seen.add(k);
          out.push(c);
        }
      }
    }
    return out.sort((a, b) => a.yPosition - b.yPosition);
  }, [activeBpData, activeBp]);
  // Total unique change count across every breakpoint — the header badge
  // shows the same number as the Detected Changes list and the page-card
  // badge, regardless of which viewport tab is active.
  // Accepted (expected) diffs don't count toward the header badge.
  const totalChangeCount = activeChanges(crossBpChanges, report.id, accepted).length;
  // Merge scope-aware specific counts into the per-breakpoint stats so the
  // deviation dots in BreakpointTabs can distinguish universal changes from
  // breakpoint-specific ones.
  // For the deviation dots we use raw per-change classification, not the
  // grouped per-selector counts used by the header badges.  A selector
  // group that mixes universal + specific changes would hide the universal
  // signal when grouped, but the dots should answer a simpler question:
  // "does this breakpoint have ANY universal change?" / "…ANY specific?"
  const bpChangeCountsWithScope = useMemo(() => {
    const merged = { ...bpChangeCounts };
    for (const [bp, stats] of Object.entries(merged)) {
      const specific = dotScope.specificCountPerBp[bp] ?? 0;
      merged[bp] = {
        ...stats,
        universalCount: stats.changeCount - specific,
        specificCount: specific,
      };
    }
    return merged;
  }, [bpChangeCounts, dotScope]);

  // Early return must follow every hook above so hook order stays stable.
  if (!currentPage) return null;

  const bpResult = activeBpData[String(activeBp)];

  // Keep the leading slash so the title matches how the page renders in the
  // grid card ("/post/foyer-and-nayya", not "post/foyer-and-nayya").
  // The root path is the only exception — "index" reads better than "/".
  const pageName = currentPage.stepLabel
    ? currentPage.stepLabel
    : currentPage.path === "/"
      ? "index"
      : currentPage.path;

  return (
    <>
      <div
        className={`page-detail-scrim ${animState === "visible" ? "page-detail-scrim--visible" : "page-detail-scrim--hidden"}`}
        style={{
          transitionDuration:
            animState === "exiting" ? `${EXIT_MS}ms` : `${ANIM_MS}ms`,
          transitionTimingFunction:
            animState === "exiting" ? "ease-in" : ANIM_EASE,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) handleClose();
        }}
      >
        <div
          ref={panelRef}
          className="page-detail-panel"
          style={getPanelStyle()}
        >
          <div
            className="page-detail-panel__content"
            style={{
              opacity:
                animState === "visible" || animState === "exiting" ? 1 : 0,
              transition:
                animState === "entering"
                  ? `opacity ${CONTENT_FADE_MS}ms ease-out ${CONTENT_DELAY_MS}ms`
                  : "none",
              pointerEvents: animState === "visible" ? "auto" : "none",
            }}
          >
            <PageDetailHeader
              report={report}
              pageId={pageId}
              pageName={pageName}
              prodUrl={resolvePageUrl(
                currentPage,
                bpResult,
                project.prodUrl,
                "prod",
              )}
              devUrl={resolvePageUrl(
                currentPage,
                bpResult,
                project.devUrl,
                "dev",
              )}
              noData={!bpResult?.prodScreenshot}
              changeCount={totalChangeCount}
              activeBp={activeBp}
              prevPage={prevPage}
              nextPage={nextPage}
              getPageLabel={getPageLabel}
              onNavigate={onNavigate}
              onClose={handleClose}
            />

            <div
              className="page-detail-panel__breakpoints animate-card-in"
              style={{ animationDelay: "15ms" }}
            >
              <div className="page-detail-panel__bp-group">
                <BreakpointTabs
                  active={activeBp}
                  onChange={onBpChange}
                  changeCounts={bpChangeCountsWithScope}
                  breakpoints={reportBreakpoints}
                  align="start"
                />
                <VariantTabs
                  variants={reportVariants}
                  active={activeVariant}
                  onChange={onVariantChange}
                />
              </div>
              {report.pages.length > 1 && (
                <TabBar<ReportFilterMode>
                  items={[
                    { id: "all", label: "All pages" },
                    { id: "changes", label: "Changes only" },
                  ]}
                  active={filterMode}
                  onSelect={onFilterChange}
                />
              )}
            </div>

            <div className="page-detail-panel__divider" />

            <div
              className="page-detail-panel__main animate-card-in"
              style={{ animationDelay: "30ms" }}
            >
              <div
                ref={scrollRef}
                className="page-detail-panel__screenshot-col page-detail-panel__screenshot-col--sticky-header"
              >
                {bpResult && (
                  <PageDetailViewToggle
                    viewMode={viewMode}
                    showingDev={showingDev}
                    diffMode={diffMode}
                    changeViewMode={changeViewMode}
                    setForceDevLocked={setForceDevLocked}
                    setShowingDev={setShowingDev}
                    setDiffMode={setDiffMode}
                  />
                )}
                {bpResult ? (
                  <div
                    ref={screenshotRef}
                    className="page-detail-panel__screenshot"
                    style={{ maxWidth: activeBp }}
                  >
                    {/* Tap/Slider compare prod vs dev. The Diff toggle swaps
                        the plain aligned screenshots for their change-
                        highlighted variants (falling back to plain when a
                        side has no highlight — e.g. zero-change pages). */}
                    <SliderComparison
                      prodSrc={`/api/screenshots/${
                        diffMode && bpResult.highlightScreenshot
                          ? bpResult.highlightScreenshot
                          : bpResult.alignedProdScreenshot ?? bpResult.prodScreenshot
                      }`}
                      devSrc={`/api/screenshots/${
                        diffMode && bpResult.highlightDevScreenshot
                          ? bpResult.highlightDevScreenshot
                          : bpResult.alignedDevScreenshot ?? bpResult.devScreenshot
                      }`}
                      mode={viewMode}
                      onModeChange={(m) => {
                        changeViewMode(m);
                        if (m !== "tap") {
                          setForceDevLocked(false);
                          setShowingDev(false);
                        }
                      }}
                      onPressedChange={setShowingDev}
                      forceDev={forceDevLocked}
                      hideHeader
                      changes={bpResult.semanticChanges}
                      highlightedChangeId={highlightedChangeId}
                    />
                  </div>
                ) : (
                  <div className="page-detail-panel__empty">
                    <p className="page-detail-panel__empty-text">
                      No screenshot available for this breakpoint.
                    </p>
                  </div>
                )}
              </div>

              {bpResult && (
                <PageDetailChanges
                  changes={crossBpChanges}
                  hasPixelDiff={(bpResult.pixelChangeCount ?? 0) > 0}
                  activeBp={activeBp}
                  changeScope={changeScope}
                  reportId={report.id}
                  onChangeClick={(id) => {
                    // Tapping a change item is a request to inspect it —
                    // turn Diff on so the highlighted regions are visible,
                    // then let SliderComparison scroll the change into view.
                    setDiffMode(true);
                    setHighlightedChangeId(id);
                    setTimeout(() => setHighlightedChangeId(null), 3000);
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
