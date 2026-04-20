"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import BreakpointTabs from "@/components/BreakpointTabs";
import VariantTabs from "@/components/VariantTabs";
import DiffViewer from "@/components/DiffViewer";
import SliderComparison from "@/components/SliderComparison";
import ChangeList from "@/components/ChangeList";
import { formatRelativeTime, formatFullDateTime } from "@/lib/relative-time";
import { reportDotColor } from "@/lib/colors";
import type { Report, Project, ReportPage } from "@/lib/types";
import { countUniqueSemanticChanges } from "@/lib/change-identity";

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

// Final panel insets (relative to viewport) — equal gutters all sides.
const PANEL = { top: 28, right: 28, bottom: 28, left: 28 };
const ANIM_MS = 300;
const ANIM_EASE = "cubic-bezier(0.2, 0, 0, 1)"; // Material emphasizedDecelerate
// Content fades in after container has finished expanding (no reflow slide)
const CONTENT_FADE_MS = 150;
const CONTENT_DELAY_MS = ANIM_MS; // wait for expansion to complete

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
  const [forceDevLocked, setForceDevLocked] = useState(false);
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
        filter: "blur(8px)",
        transition: `opacity ${EXIT_MS}ms ease-in, transform ${EXIT_MS}ms ease-in, filter ${EXIT_MS}ms ease-in`,
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

  // Scroll to top when page changes.
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
    scrollTopRef.current = 0;
  }, [pageId]);

  // Preserve scroll across tab/breakpoint interactions. Content swaps (Changes
  // ↔ Tap/Slider) or breakpoint changes can momentarily shrink the content
  // height (e.g. while a new image loads), which causes the browser to clamp
  // scrollTop to 0. We remember the user's last scroll position on every
  // scroll event, and any time the content resizes, if the browser has
  // clamped us below the remembered position and there's now enough room to
  // restore it, put the user back where they were.
  const scrollTopRef = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => { scrollTopRef.current = el.scrollTop; };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const maxScroll = el.scrollHeight - el.clientHeight;
      const target = Math.min(scrollTopRef.current, maxScroll);
      if (target > 0 && el.scrollTop < target) {
        el.scrollTop = target;
      }
    });
    const content = el.firstElementChild;
    if (content) observer.observe(content);
    return () => observer.disconnect();
  }, []);

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

  // Structural-change count per breakpoint for the tab dots. Pixel-only
  // differences count as green ("pixels moved but nothing structurally
  // changed"). -1 signals "no screenshot yet" (grey dot).
  const bpChangeCounts: Record<string, number> = {};
  for (const [key, val] of Object.entries(activeBpData)) {
    bpChangeCounts[key] = val.prodScreenshot ? (val.semanticChanges?.length ?? 0) : -1;
  }

  // Total unique structural changes across all breakpoints for this page,
  // deduped by change identity (selector + property + values).
  const totalUniqueChanges = countUniqueSemanticChanges(
    Object.values(activeBpData).map((bp) => bp.semanticChanges),
  );

  // Derive breakpoints actually used in this report from the data
  const reportBreakpoints: number[] = (() => {
    const bpSet = new Set<number>();
    for (const page of report.pages) {
      for (const bp of Object.keys(page.breakpoints)) bpSet.add(Number(bp));
    }
    return [...bpSet].sort((a, b) => a - b);
  })();

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

        {/* Header — page name + badge | nav controls */}
        <div className="relative z-10 flex items-center justify-between px-[24px] py-[20px] animate-card-in"
          style={{ animationDelay: "0ms" }}>
          {/* Left: page name + change count. Clicking the name opens a
              dropdown with the live prod/dev URLs for this specific page —
              no chevron so the affordance stays discoverable-by-hover. */}
          <div className="flex items-center gap-[8px] min-w-0">
            <PageTitleMenu
              label={pageName}
              prodUrl={`${project.prodUrl.replace(/\/$/, "")}${currentPage.path === "/" ? "" : currentPage.path}`}
              devUrl={`${project.devUrl.replace(/\/$/, "")}${currentPage.path === "/" ? "" : currentPage.path}`}
            />
            <span className={`flex h-[32px] min-w-[32px] shrink-0 items-center justify-center rounded-full px-[6px] text-[14px] ${
              !bpResult?.prodScreenshot ? "bg-text-disabled/20 text-text-disabled" : totalUniqueChanges > 0 ? "bg-accent-yellow text-foreground" : "bg-accent-green text-foreground"
            }`}>
              {bpResult?.prodScreenshot ? totalUniqueChanges : "—"}
            </span>
          </div>

          {/* Right: date + status dot + report dropdown + prev/next + close */}
          <div className="flex shrink-0 items-center gap-[24px]">
            {/* Date + status dot */}
            <div className="flex items-center gap-[8px]">
              <span
                className="text-[16px] text-foreground"
                title={formatFullDateTime(report.createdAt)}
              >
                {formatRelativeTime(report.createdAt)}
              </span>
              <span className={`inline-block h-[8px] w-[8px] shrink-0 rounded-full ${reportDotColor(report)}`} />
            </div>

            {/* Report dropdown chevron */}
            <PageNavDropdown
              pages={report.pages}
              currentPageId={pageId}
              activeBp={activeBp}
              getLabel={getPageLabel}
              onSelect={onNavigate}
            />

            {/* Prev page */}
            <button
              onClick={() => prevPage && onNavigate(prevPage.pageId)}
              disabled={!prevPage}
              className="flex h-[32px] w-[32px] items-center justify-center rounded-[8px] text-text-subtle transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
              title="Previous page"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Next page */}
            <button
              onClick={() => nextPage && onNavigate(nextPage.pageId)}
              disabled={!nextPage}
              className="flex h-[32px] w-[32px] items-center justify-center rounded-[8px] text-text-subtle transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
              title="Next page"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Close */}
            <button
              onClick={handleClose}
              className="flex h-[32px] w-[32px] items-center justify-center rounded-[8px] text-text-subtle transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
              title="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
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
        <div className="px-[24px] animate-card-in" style={{ animationDelay: "15ms" }}>
          <BreakpointTabs
            active={activeBp}
            onChange={onBpChange}
            changeCounts={bpChangeCounts}
            breakpoints={reportBreakpoints}
            align="start"
          />
        </div>

        {/* Divider */}
        <div className="h-px bg-border-primary" />

        {/* Content area: scrollable screenshot + fixed changes sidebar */}
        <div className="flex flex-1 overflow-hidden bg-surface-tertiary animate-card-in" style={{ animationDelay: "30ms" }}>
          {/* Scrollable screenshot column — top padding lives on the sticky
              tab row so content scrolls behind it. */}
          <div ref={scrollRef} className="flex flex-1 flex-col items-center overflow-y-auto px-[24px] pb-[24px]">
            {/* View mode tabs — sticky to scroll container top; self-stretch
                overrides the parent's items-center so the background bleeds
                edge-to-edge. */}
            {bpResult && (
              <div className="sticky top-0 z-10 flex items-center justify-center gap-[56px] self-stretch bg-surface-tertiary pt-[24px] pb-[16px] text-[14px]">
                <button
                  onClick={() => { setViewMode("tap"); setForceDevLocked(false); setShowingDev(false); }}
                  className={`w-[32px] text-right transition-colors duration-150 ${
                    (viewMode === "tap" && !showingDev) || viewMode === "changes" ? "text-foreground underline underline-offset-4 decoration-1" : "text-text-muted hover:text-foreground"
                  }`}
                >Prod</button>
                <div className="flex items-center gap-[4px] rounded-[8px] bg-surface-content p-[3px]">
                  {(["changes", "tap", "slider"] as const).map((m) => {
                    const label = m === "tap" ? "Tap" : m === "slider" ? "Slider" : "Changes";
                    const active = viewMode === m;
                    return (
                      <button
                        key={m}
                        onClick={() => { setViewMode(m); if (m !== "tap") { setForceDevLocked(false); setShowingDev(false); } }}
                        className={`rounded-[6px] px-[10px] py-[3px] text-[12px] transition-colors ${
                          active
                            ? "bg-surface-tertiary"
                            : "text-text-muted hover:text-foreground"
                        }`}
                      >
                        {/* Grid stack reserves width of the bold label so the
                            pill group doesn't shimmy when selection changes. */}
                        <span className="grid">
                          <span className={`col-start-1 row-start-1 ${active ? "font-bold" : "font-normal"}`}>{label}</span>
                          <span aria-hidden className="col-start-1 row-start-1 invisible font-bold">{label}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => { setViewMode("tap"); setForceDevLocked(true); setShowingDev(true); }}
                  className={`w-[32px] transition-colors duration-150 ${
                    viewMode === "tap" && showingDev ? "text-foreground underline underline-offset-4 decoration-1" : "text-text-muted hover:text-foreground"
                  }`}
                >Dev</button>
              </div>
            )}
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
                    onModeChange={(m) => { setViewMode(m); if (m !== "tap") { setForceDevLocked(false); setShowingDev(false); } }}
                    onPressedChange={setShowingDev}
                    forceDev={forceDevLocked}
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
              ) : bpResult.pixelChangeCount && bpResult.pixelChangeCount > 0 ? (
                <div className="flex items-start gap-[12px] border-l-[3px] border-l-accent-green bg-surface-tertiary py-[10px] pl-[12px] pr-[16px]">
                  <span className="mt-[2px] flex h-[20px] w-[20px] flex-shrink-0 items-center justify-center text-[13px] text-foreground">
                    ✓
                  </span>
                  <div className="flex min-w-0 flex-col gap-[2px]">
                    <span className="text-[14px] text-foreground">No structural changes</span>
                    <span className="text-[12px] text-text-subtle">Some pixel differences detected</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-[12px] border-l-[3px] border-l-accent-green bg-surface-tertiary py-[10px] pl-[12px] pr-[16px]">
                  <span className="mt-[2px] flex h-[20px] w-[20px] flex-shrink-0 items-center justify-center text-[13px] text-foreground">
                    ✓
                  </span>
                  <div className="flex min-w-0 flex-col gap-[2px]">
                    <span className="text-[14px] text-foreground">No differences between versions</span>
                  </div>
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

/** Page title that doubles as a dropdown of prod/dev URLs for this page.
 *  No chevron — the affordance is discovered via hover color. */
function PageTitleMenu({
  label,
  prodUrl,
  devUrl,
}: {
  label: string;
  prodUrl: string;
  devUrl: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative min-w-0">
      <button
        onClick={() => setOpen(!open)}
        className="truncate rounded-[6px] px-[4px] text-[32px] text-foreground transition-colors hover:bg-foreground/[0.03]"
      >
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[52px] z-40 flex min-w-[320px] flex-col gap-[2px] rounded-[12px] bg-surface-content p-[8px] shadow-elevation-lg">
            <a
              href={prodUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex flex-col gap-[2px] rounded-[8px] px-[12px] py-[8px] transition-colors hover:bg-surface-tertiary"
            >
              <span className="text-[12px] font-bold uppercase tracking-wide text-text-subtle">Prod</span>
              <span className="truncate text-[14px] text-foreground">{prodUrl}</span>
            </a>
            <a
              href={devUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex flex-col gap-[2px] rounded-[8px] px-[12px] py-[8px] transition-colors hover:bg-surface-tertiary"
            >
              <span className="text-[12px] font-bold uppercase tracking-wide text-text-subtle">Dev</span>
              <span className="truncate text-[14px] text-foreground">{devUrl}</span>
            </a>
          </div>
        </>
      )}
    </div>
  );
}

/** Chevron dropdown — page navigation */
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
        className="flex h-[32px] w-[32px] items-center justify-center rounded-[8px] text-text-subtle transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        title="Jump to page"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[40px] z-40 flex min-w-[280px] max-w-[400px] flex-col rounded-[12px] bg-surface-content p-[8px] shadow-elevation-lg">
            <div className="flex flex-col gap-[2px]">
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
                    className={`flex items-center gap-[8px] rounded-[8px] px-[12px] py-[8px] text-left text-[14px] text-foreground ${
                      isCurrent
                        ? "font-bold"
                        : "font-normal hover:bg-surface-tertiary"
                    }`}
                  >
                    <span className="flex-1 text-left">{label}</span>
                    <span className={`inline-block h-[8px] w-[8px] shrink-0 rounded-full ${
                      !hasScreenshot ? "bg-text-disabled" : pageChanges > 0 ? "bg-accent-yellow" : "bg-accent-green"
                    }`} />
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

