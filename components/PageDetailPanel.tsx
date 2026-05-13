"use client";

import { useRef, useState } from "react";
import BreakpointTabs from "@/components/BreakpointTabs";
import VariantTabs from "@/components/VariantTabs";
import DiffViewer from "@/components/DiffViewer";
import SliderComparison from "@/components/SliderComparison";
import type { Project, Report } from "@/lib/types";
import { countUniqueSemanticChanges } from "@/lib/change-identity";
import { PageDetailHeader } from "./PageDetailHeader";
import { PageDetailViewToggle } from "./PageDetailViewToggle";
import { PageDetailChanges } from "./PageDetailChanges";
import { usePageDetailAnimation } from "./use/pageDetailAnimation";
import { usePageDetailViewMode } from "./use/pageDetailViewMode";
import { usePageDetailKeyboardNav } from "./use/pageDetailKeyboardNav";
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
} from "./utils/pageDetail";

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
    setViewMode,
    changeViewMode,
    scrollRef,
    screenshotRef,
  } = usePageDetailViewMode({ pageId });

  const currentIndex = report.pages.findIndex((p) => p.pageId === pageId);
  const currentPage = currentIndex >= 0 ? report.pages[currentIndex] : null;
  const prevPage = currentIndex > 0 ? report.pages[currentIndex - 1] : null;
  const nextPage =
    currentIndex < report.pages.length - 1
      ? report.pages[currentIndex + 1]
      : null;

  usePageDetailKeyboardNav({
    prevPage,
    nextPage,
    onNavigate,
    onClose: handleClose,
  });

  if (!currentPage) return null;

  const activeBpData =
    activeVariant && currentPage.variants?.[activeVariant]
      ? currentPage.variants[activeVariant]
      : currentPage.breakpoints;
  const bpResult = activeBpData[String(activeBp)];

  const pageName = currentPage.stepLabel
    ? currentPage.stepLabel
    : currentPage.path === "/"
      ? "index"
      : currentPage.path.replace(/^\//, "");

  const bpChangeCounts = computeBpChangeCounts(activeBpData);

  const totalUniqueChanges = countUniqueSemanticChanges(
    Object.values(activeBpData).map((bp) => bp.semanticChanges),
  );

  const reportBreakpoints = collectReportBreakpoints(report);
  const reportVariants = collectReportVariants(report);

  const badgeMod = !bpResult?.prodScreenshot
    ? "badge--neutral"
    : totalUniqueChanges > 0
      ? "badge--warning"
      : "badge--success";

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
              badgeMod={badgeMod}
              badgeContent={bpResult?.prodScreenshot ? totalUniqueChanges : "—"}
              activeBp={activeBp}
              prevPage={prevPage}
              nextPage={nextPage}
              getPageLabel={getPageLabel}
              onNavigate={onNavigate}
              onClose={handleClose}
            />

            <div>
              <VariantTabs
                variants={reportVariants}
                active={activeVariant}
                onChange={onVariantChange}
              />
            </div>

            <div
              className="page-detail-panel__breakpoints animate-card-in"
              style={{ animationDelay: "15ms" }}
            >
              <BreakpointTabs
                active={activeBp}
                onChange={onBpChange}
                changeCounts={bpChangeCounts}
                breakpoints={reportBreakpoints}
                align="start"
              />
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
                    changeViewMode={changeViewMode}
                    setForceDevLocked={setForceDevLocked}
                    setShowingDev={setShowingDev}
                  />
                )}
                {bpResult ? (
                  <div
                    ref={screenshotRef}
                    className="page-detail-panel__screenshot"
                    style={{ maxWidth: activeBp }}
                  >
                    {viewMode === "changes" ? (
                      <DiffViewer
                        prodSrc={`/api/screenshots/${bpResult.alignedProdScreenshot ?? bpResult.prodScreenshot}`}
                        devSrc={`/api/screenshots/${bpResult.alignedDevScreenshot ?? bpResult.devScreenshot}`}
                        alt={`Diff for ${currentPage.path}`}
                        changes={bpResult.semanticChanges}
                        highlightedChangeId={highlightedChangeId}
                      />
                    ) : (
                      <SliderComparison
                        prodSrc={`/api/screenshots/${bpResult.alignedProdScreenshot ?? bpResult.prodScreenshot}`}
                        devSrc={`/api/screenshots/${bpResult.alignedDevScreenshot ?? bpResult.devScreenshot}`}
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
                      />
                    )}
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
                  bpResult={bpResult}
                  onChangeClick={(id) => {
                    // Tapping a change item is a request to inspect it —
                    // force the Changes view so the marker is visible
                    // before DiffViewer scrolls it into view. The user
                    // is asking to be repositioned (scrollIntoView in
                    // DiffViewer), so don't snapshot scrollTop here.
                    if (viewMode !== "changes") setViewMode("changes");
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
