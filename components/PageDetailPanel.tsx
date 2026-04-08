"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import BreakpointTabs from "@/components/BreakpointTabs";
import VariantTabs from "@/components/VariantTabs";
import DiffViewer from "@/components/DiffViewer";
import SliderComparison from "@/components/SliderComparison";
import ChangeList from "@/components/ChangeList";
import type { Report, Project, ReportPage } from "@/lib/types";

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

// Final panel insets (relative to viewport)
const PANEL = { top: 28, right: 28, bottom: 28, left: 112 };
const ANIM_MS = 300;
const ANIM_EASE = "cubic-bezier(0.2, 0, 0, 1)"; // Material emphasizedDecelerate
// Content fades in early during the container expansion
const CONTENT_FADE_MS = 200;
const CONTENT_DELAY_MS = 50; // start almost immediately

export default function PageDetailPanel({
  report,
  project,
  pageId,
  initialBp,
  initialVariant,
  originRect,
  originThumb,
  onClose,
  onNavigate,
  onBpChange,
  onVariantChange,
}: Props) {
  const [animState, setAnimState] = useState<"entering" | "visible" | "exiting">("entering");
  const [highlightedChangeId, setHighlightedChangeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"tap" | "slider" | "changes">("tap");
  const [showingDev, setShowingDev] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const activeBp = initialBp;
  const activeVariant = initialVariant;

  const hasOrigin = !!(originRect);

  // Animate in — trigger expansion on next frame
  useEffect(() => {
    if (hasOrigin) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimState("visible"));
      });
    } else {
      setAnimState("visible");
    }
  }, []);

  const EXIT_MS = 150;

  const handleClose = useCallback(() => {
    setAnimState("exiting");
    setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  // Container style: expands from card rect → final panel position
  const getPanelStyle = (): React.CSSProperties => {
    const enterTransition = `top ${ANIM_MS}ms ${ANIM_EASE}, left ${ANIM_MS}ms ${ANIM_EASE}, width ${ANIM_MS}ms ${ANIM_EASE}, height ${ANIM_MS}ms ${ANIM_EASE}, border-radius ${ANIM_MS}ms ${ANIM_EASE}, opacity ${ANIM_MS}ms ${ANIM_EASE}`;

    if (animState === "entering" && originRect) {
      return {
        position: "fixed",
        top: originRect.top,
        left: originRect.left,
        width: originRect.width,
        height: originRect.height,
        borderRadius: 8,
        opacity: 1,
        transition: enterTransition,
      };
    }
    if (animState === "exiting") {
      return {
        position: "fixed",
        top: PANEL.top,
        left: PANEL.left,
        width: `calc(100vw - ${PANEL.left + PANEL.right}px)`,
        height: `calc(100vh - ${PANEL.top + PANEL.bottom}px)`,
        borderRadius: 12,
        opacity: 0,
        transform: "scale(0.90)",
        transition: `opacity ${EXIT_MS}ms ease-in, transform ${EXIT_MS}ms ease-in`,
      };
    }
    // Final position
    return {
      position: "fixed",
      top: PANEL.top,
      left: PANEL.left,
      width: `calc(100vw - ${PANEL.left + PANEL.right}px)`,
      height: `calc(100vh - ${PANEL.top + PANEL.bottom}px)`,
      borderRadius: 12,
      opacity: 1,
      transition: enterTransition,
    };
  };

  const isExpanded = animState === "visible";

  // Keyboard: Escape to close, arrows to navigate pages
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      } else if (e.key === "ArrowLeft" && prevPage) {
        e.preventDefault();
        onNavigate(prevPage.pageId);
      } else if (e.key === "ArrowRight" && nextPage) {
        e.preventDefault();
        onNavigate(nextPage.pageId);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  // Scroll to top when page changes
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [pageId]);

  const currentIndex = report.pages.findIndex((p) => p.pageId === pageId);
  const currentPage = currentIndex >= 0 ? report.pages[currentIndex] : null;
  const prevPage = currentIndex > 0 ? report.pages[currentIndex - 1] : null;
  const nextPage = currentIndex < report.pages.length - 1 ? report.pages[currentIndex + 1] : null;

  if (!currentPage) return null;

  // Get breakpoint data respecting active variant
  const activeBpData = activeVariant && currentPage.variants?.[activeVariant]
    ? currentPage.variants[activeVariant]
    : currentPage.breakpoints;
  const bpResult = activeBpData[String(activeBp)];

  const pageName = currentPage.stepLabel
    ? currentPage.stepLabel
    : currentPage.path === "/"
      ? "index"
      : currentPage.path.replace(/^\//, "");

  // Change counts per breakpoint for the tab dots
  // Use -1 to signal "no screenshot" (grey dot) vs 0 for "has screenshot, no changes" (green dot)
  const bpChangeCounts: Record<string, number> = {};
  for (const [key, val] of Object.entries(activeBpData)) {
    bpChangeCounts[key] = val.prodScreenshot ? (val.changeCount || 0) : -1;
  }

  // Discover which variants exist in this report
  const reportVariants: string[] = [];
  const variantIds = new Set<string>();
  for (const page of report.pages) {
    if (page.variants) {
      for (const vid of Object.keys(page.variants)) variantIds.add(vid);
    }
  }
  reportVariants.push(...variantIds);

  const getPageLabel = (page: ReportPage) =>
    page.stepLabel
      ? page.stepLabel
      : page.path === "/"
        ? "index"
        : page.path.replace(/^\//, "");

  return (
    <>
      {/* Scrim */}
      <div
        className={`fixed inset-0 z-20 transition-colors ${
          animState === "visible" ? "bg-black/30" : "bg-transparent pointer-events-none"
        }`}
        style={{
          transitionDuration: animState === "exiting" ? `${EXIT_MS}ms` : `${ANIM_MS}ms`,
          transitionTimingFunction: animState === "exiting" ? "ease-in" : ANIM_EASE,
        }}
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      >
        {/* Expanding container */}
        <div
          ref={panelRef}
          className="relative flex flex-col bg-surface-content shadow-elevation-lg overflow-hidden"
          style={getPanelStyle()}
        >
          {/* Panel content — fades in as the container finishes expanding */}
          <div
            className="flex flex-1 flex-col overflow-hidden"
            style={{
              opacity: animState === "visible" || animState === "exiting" ? 1 : 0,
              transition: animState === "entering"
                ? `opacity ${CONTENT_FADE_MS}ms ease-out ${CONTENT_DELAY_MS}ms`
                : "none",
              pointerEvents: animState === "visible" ? "auto" : "none",
            }}
          >

        {/* Header */}
        <div className="flex flex-col gap-[16px] px-[24px] py-[20px] pb-0">
          {/* Title row */}
          <div className="flex items-center justify-between gap-[16px]">
            {/* Left: page name + change count */}
            <div className="flex min-w-0 items-center gap-[16px]">
              <div className="flex min-w-0 items-baseline gap-[8px]">
                <h2 className="truncate text-[28px] font-bold text-foreground">{pageName}</h2>
              </div>
              <span className={`flex h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-full px-[8px] text-[16px] text-foreground ${
                bpResult && bpResult.changeCount > 0 ? "bg-accent-yellow-tint" : "bg-accent-green-tint"
              }`}>
                {bpResult?.changeCount ?? 0}
              </span>
            </div>

            {/* Right: arrows + close */}
            <div className="flex shrink-0 items-center gap-[16px]">
              {/* Page navigation dropdown */}
              <PageNavDropdown
                pages={report.pages}
                currentPageId={pageId}
                activeBp={activeBp}
                getLabel={getPageLabel}
                onSelect={onNavigate}
              />

              {/* Prev arrow */}
              <button
                onClick={() => prevPage && onNavigate(prevPage.pageId)}
                disabled={!prevPage}
                className={`flex h-[32px] w-[32px] items-center justify-center rounded-[8px] transition-colors ${
                  prevPage ? "text-text-secondary hover:bg-foreground/[0.05] hover:text-foreground" : "text-text-disabled"
                }`}
                title={prevPage ? getPageLabel(prevPage) : undefined}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* Next arrow */}
              <button
                onClick={() => nextPage && onNavigate(nextPage.pageId)}
                disabled={!nextPage}
                className={`flex h-[32px] w-[32px] items-center justify-center rounded-[8px] transition-colors ${
                  nextPage ? "text-text-secondary hover:bg-foreground/[0.05] hover:text-foreground" : "text-text-disabled"
                }`}
                title={nextPage ? getPageLabel(nextPage) : undefined}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* Close */}
              <button
                onClick={handleClose}
                className="flex h-[40px] w-[40px] items-center justify-center rounded-[10px] text-text-secondary transition-all hover:bg-foreground/[0.05] hover:text-foreground"
                title="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div>
          <VariantTabs
            variants={reportVariants}
            active={activeVariant}
            onChange={onVariantChange}
          />
        </div>

        {/* Breakpoint tabs */}
        <div className="px-[24px]">
          <BreakpointTabs
            active={activeBp}
            onChange={onBpChange}
            changeCounts={bpChangeCounts}
            breakpoints={project?.breakpoints}
          />
        </div>

        {/* View mode tabs */}
        {bpResult && (
          <div className="flex items-center justify-center gap-[56px] px-[24px] pb-[8px] pt-[16px] text-[14px]">
            <span className={`w-[32px] text-right transition-colors duration-150 ${
              (viewMode === "tap" && !showingDev) || viewMode === "changes" ? "text-foreground underline underline-offset-4 decoration-1" : "text-text-muted"
            }`}>Prod</span>
            <div className="flex items-center gap-[4px] rounded-[8px] bg-surface-tertiary p-[3px]">
              {(["changes", "tap", "slider"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={`rounded-[6px] px-[10px] py-[3px] text-[12px] transition-colors ${
                    viewMode === m
                      ? "bg-surface-content font-bold shadow-sm"
                      : "text-text-muted hover:text-foreground"
                  }`}
                >
                  {m === "tap" ? "Tap" : m === "slider" ? "Slider" : "Changes"}
                </button>
              ))}
            </div>
            <span className={`w-[32px] transition-colors duration-150 ${
              viewMode === "tap" && showingDev ? "text-foreground underline underline-offset-4 decoration-1" : "text-text-muted"
            }`}>Dev</span>
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-border-primary" />

        {/* Content area: scrollable screenshot + fixed changes sidebar */}
        <div className="flex flex-1 overflow-hidden bg-surface-tertiary">
          {/* Scrollable screenshot column */}
          <div ref={scrollRef} className="flex flex-1 justify-center overflow-y-auto p-[24px]">
            {bpResult ? (
              <div className="min-w-0" style={{ maxWidth: activeBp }}>
                {viewMode === "changes" ? (
                  <DiffViewer
                    src={`/api/screenshots/${bpResult.diffScreenshot}`}
                    alt={`Diff for ${currentPage.path}`}
                    changes={bpResult.semanticChanges}
                    highlightedChangeId={highlightedChangeId}
                  />
                ) : (
                  <SliderComparison
                    prodSrc={`/api/screenshots/${bpResult.alignedProdScreenshot ?? bpResult.prodScreenshot}`}
                    devSrc={`/api/screenshots/${bpResult.alignedDevScreenshot ?? bpResult.devScreenshot}`}
                    mode={viewMode}
                    onModeChange={(m) => setViewMode(m)}
                    onPressedChange={setShowingDev}
                    hideHeader
                  />
                )}
              </div>
            ) : (
              <div className="flex w-full items-center justify-center rounded-[8px] bg-surface-content px-[24px] py-[48px]">
                <p className="text-[14px] text-text-muted">
                  No screenshot available for this breakpoint.
                </p>
              </div>
            )}
          </div>

          {/* Fixed changes sidebar */}
          {bpResult && (
            <div className="w-[340px] shrink-0 overflow-y-auto border-l border-border-primary bg-surface-content p-[24px]">
              {bpResult.semanticChanges && bpResult.semanticChanges.length > 0 ? (
                <ChangeList
                  changes={bpResult.semanticChanges}
                  summary={bpResult.changeSummary}
                  onChangeClick={(id) => {
                    setHighlightedChangeId(id);
                    setTimeout(() => setHighlightedChangeId(null), 3000);
                  }}
                />
              ) : (
                <div className="flex items-center gap-[8px] rounded-[8px] bg-surface-tertiary px-[20px] py-[16px]">
                  <span className="text-[20px]">✓</span>
                  <span className="text-[14px] text-text-secondary">
                    No differences between versions
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        </div>{/* end incoming layer */}
      </div>{/* end expanding container */}
    </div>{/* end scrim */}
    </>
  );
}

/** Dropdown to pick a page within the report */
function PageNavDropdown({
  pages,
  currentPageId,
  activeBp,
  getLabel,
  onSelect,
}: {
  pages: ReportPage[];
  currentPageId: string;
  activeBp: number;
  getLabel: (page: ReportPage) => string;
  onSelect: (pageId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-[32px] w-[32px] items-center justify-center rounded-[8px] text-text-secondary transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        title="Navigate pages"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M4.5 6.75l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[40px] z-40 flex min-w-[280px] max-w-[400px] flex-col gap-[4px] rounded-[12px] bg-surface-content p-[12px] shadow-elevation-lg">
            {pages.map((page) => {
              const label = getLabel(page);
              const isCurrent = page.pageId === currentPageId;
              const pageBpResult = page.breakpoints[String(activeBp)];
              const pageChanges = pageBpResult?.changeCount ?? 0;
              const hasScreenshot = !!pageBpResult?.prodScreenshot;
              return (
                <button
                  key={page.pageId}
                  onClick={() => { onSelect(page.pageId); setOpen(false); }}
                  className={`flex items-center gap-[8px] rounded-[8px] px-[12px] py-[6px] text-[14px] text-foreground ${
                    isCurrent
                      ? "bg-surface-tertiary font-bold"
                      : "font-normal hover:bg-surface-tertiary"
                  }`}
                >
                  <span className="truncate">{label}</span>
                  <span className={`inline-block h-[8px] w-[8px] shrink-0 rounded-full ${
                    !hasScreenshot ? "bg-text-disabled" : pageChanges > 0 ? "bg-accent-yellow" : "bg-accent-green"
                  }`} />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

