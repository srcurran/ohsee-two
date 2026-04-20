"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import BreakpointTabs from "@/components/BreakpointTabs";
import VariantTabs from "@/components/VariantTabs";
import DiffViewer from "@/components/DiffViewer";
import SliderComparison from "@/components/SliderComparison";
import ChangeList from "@/components/ChangeList";
import { formatRelativeTime, formatFullDateTime } from "@/lib/relative-time";
import { reportDotModifier } from "@/lib/colors";
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

// Equal gutters all sides.
const PANEL = { top: 28, right: 28, bottom: 28, left: 28 };
const ANIM_MS = 300;
const ANIM_EASE = "cubic-bezier(0.2, 0, 0, 1)";
const CONTENT_FADE_MS = 150;
const CONTENT_DELAY_MS = ANIM_MS;

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
  const [animState, setAnimState] = useState<"entering" | "visible" | "exiting">("entering");
  const [highlightedChangeId, setHighlightedChangeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"tap" | "slider" | "changes">("tap");
  const [showingDev, setShowingDev] = useState(false);
  const [forceDevLocked, setForceDevLocked] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);

  const activeBp = initialBp;
  const activeVariant = initialVariant;

  const hasOrigin = !!originRect;

  useEffect(() => {
    if (hasOrigin) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimState("visible"));
      });
    } else {
      setAnimState("visible");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const EXIT_MS = 150;

  const handleClose = useCallback(() => {
    setAnimState("exiting");
    setTimeout(onClose, EXIT_MS);
  }, [onClose]);

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

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
    scrollTopRef.current = 0;
  }, [pageId]);

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

  const activeBpData = activeVariant && currentPage.variants?.[activeVariant]
    ? currentPage.variants[activeVariant]
    : currentPage.breakpoints;
  const bpResult = activeBpData[String(activeBp)];

  const pageName = currentPage.stepLabel
    ? currentPage.stepLabel
    : currentPage.path === "/"
      ? "index"
      : currentPage.path.replace(/^\//, "");

  const bpChangeCounts: Record<string, number> = {};
  for (const [key, val] of Object.entries(activeBpData)) {
    bpChangeCounts[key] = val.prodScreenshot ? (val.semanticChanges?.length ?? 0) : -1;
  }

  const totalUniqueChanges = countUniqueSemanticChanges(
    Object.values(activeBpData).map((bp) => bp.semanticChanges),
  );

  const reportBreakpoints: number[] = (() => {
    const bpSet = new Set<number>();
    for (const page of report.pages) {
      for (const bp of Object.keys(page.breakpoints)) bpSet.add(Number(bp));
    }
    return [...bpSet].sort((a, b) => a - b);
  })();

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
          transitionDuration: animState === "exiting" ? `${EXIT_MS}ms` : `${ANIM_MS}ms`,
          transitionTimingFunction: animState === "exiting" ? "ease-in" : ANIM_EASE,
        }}
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      >
        <div
          ref={panelRef}
          className="page-detail-panel"
          style={getPanelStyle()}
        >
          <div
            className="page-detail-panel__content"
            style={{
              opacity: animState === "visible" || animState === "exiting" ? 1 : 0,
              transition: animState === "entering"
                ? `opacity ${CONTENT_FADE_MS}ms ease-out ${CONTENT_DELAY_MS}ms`
                : "none",
              pointerEvents: animState === "visible" ? "auto" : "none",
            }}
          >
            <div className="page-detail-panel__header animate-card-in" style={{ animationDelay: "0ms" }}>
              <div className="page-detail-panel__title-group">
                <PageTitleMenu
                  label={pageName}
                  prodUrl={`${project.prodUrl.replace(/\/$/, "")}${currentPage.path === "/" ? "" : currentPage.path}`}
                  devUrl={`${project.devUrl.replace(/\/$/, "")}${currentPage.path === "/" ? "" : currentPage.path}`}
                />
                <span className={`badge badge--lg ${badgeMod}`}>
                  {bpResult?.prodScreenshot ? totalUniqueChanges : "—"}
                </span>
              </div>

              <div className="page-detail-panel__nav">
                <div className="page-detail-panel__date-group">
                  <span
                    className="page-detail-panel__date"
                    title={formatFullDateTime(report.createdAt)}
                  >
                    {formatRelativeTime(report.createdAt)}
                  </span>
                  <span className={`status-dot status-dot--${reportDotModifier(report)}`} />
                </div>

                <PageNavDropdown
                  pages={report.pages}
                  currentPageId={pageId}
                  activeBp={activeBp}
                  getLabel={getPageLabel}
                  onSelect={onNavigate}
                />

                <button
                  onClick={() => prevPage && onNavigate(prevPage.pageId)}
                  disabled={!prevPage}
                  className="icon-btn"
                  title="Previous page"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <button
                  onClick={() => nextPage && onNavigate(nextPage.pageId)}
                  disabled={!nextPage}
                  className="icon-btn"
                  title="Next page"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <button onClick={handleClose} className="icon-btn" title="Close">
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

            <div className="page-detail-panel__breakpoints animate-card-in" style={{ animationDelay: "15ms" }}>
              <BreakpointTabs
                active={activeBp}
                onChange={onBpChange}
                changeCounts={bpChangeCounts}
                breakpoints={reportBreakpoints}
                align="start"
              />
            </div>

            <div className="page-detail-panel__divider" />

            <div className="page-detail-panel__main animate-card-in" style={{ animationDelay: "30ms" }}>
              <div ref={scrollRef} className="page-detail-panel__screenshot-col page-detail-panel__screenshot-col--sticky-header">
                {bpResult && (
                  <div className="page-detail-panel__view-toggle page-detail-panel__view-toggle--sticky">
                    <button
                      onClick={() => { setViewMode("tap"); setForceDevLocked(false); setShowingDev(false); }}
                      className={`page-detail-panel__view-label ${
                        (viewMode === "tap" && !showingDev) || viewMode === "changes" ? "page-detail-panel__view-label--active" : ""
                      }`}
                    >
                      Prod
                    </button>
                    <div className="segmented segmented--content-bg">
                      {(["changes", "tap", "slider"] as const).map((m) => {
                        const label = m === "tap" ? "Tap" : m === "slider" ? "Slider" : "Changes";
                        const active = viewMode === m;
                        return (
                          <button
                            key={m}
                            onClick={() => { setViewMode(m); if (m !== "tap") { setForceDevLocked(false); setShowingDev(false); } }}
                            className={`segmented__item ${active ? "segmented__item--active-alt" : ""}`}
                          >
                            <span className="view-toggle-label">
                              <span className={active ? "view-toggle-label__bold" : "view-toggle-label__regular"}>{label}</span>
                              <span aria-hidden className="view-toggle-label__ghost">{label}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => { setViewMode("tap"); setForceDevLocked(true); setShowingDev(true); }}
                      className={`page-detail-panel__view-label page-detail-panel__view-label--right ${
                        viewMode === "tap" && showingDev ? "page-detail-panel__view-label--active" : ""
                      }`}
                    >
                      Dev
                    </button>
                  </div>
                )}
                {bpResult ? (
                  <div className="page-detail-panel__screenshot" style={{ maxWidth: activeBp }}>
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
                  <div className="page-detail-panel__empty">
                    <p className="page-detail-panel__empty-text">
                      No screenshot available for this breakpoint.
                    </p>
                  </div>
                )}
              </div>

              {bpResult && (
                <div className="page-detail-panel__changes">
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
                    <div className="change-entry change-entry--ok">
                      <span className="change-entry__icon">✓</span>
                      <div className="change-entry__body">
                        <span className="change-entry__description">No structural changes</span>
                        <span className="change-entry__selector">Some pixel differences detected</span>
                      </div>
                    </div>
                  ) : (
                    <div className="change-entry change-entry--ok">
                      <span className="change-entry__icon">✓</span>
                      <div className="change-entry__body">
                        <span className="change-entry__description">No differences between versions</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** Page title that doubles as a dropdown of prod/dev URLs. */
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
    <div className="page-title-menu">
      <button
        onClick={() => setOpen(!open)}
        className="page-title-menu__trigger"
      >
        {label}
      </button>
      {open && (
        <>
          <div className="dropdown-backdrop" onClick={() => setOpen(false)} />
          <div className="page-title-menu__panel">
            <a
              href={prodUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="page-title-menu__item"
            >
              <span className="page-title-menu__kind">Prod</span>
              <span className="page-title-menu__url">{prodUrl}</span>
            </a>
            <a
              href={devUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="page-title-menu__item"
            >
              <span className="page-title-menu__kind">Dev</span>
              <span className="page-title-menu__url">{devUrl}</span>
            </a>
          </div>
        </>
      )}
    </div>
  );
}

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
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} className="icon-btn" title="Jump to page">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <>
          <div className="dropdown-backdrop" onClick={() => setOpen(false)} />
          <div className="dropdown-panel" style={{ position: "absolute", right: 0, top: 40, zIndex: 40 }}>
            {pages.map((page) => {
              const label = getLabel(page);
              const isCurrent = page.pageId === currentPageId;
              const pageBpResult = page.breakpoints[String(activeBp)];
              const pageChanges = pageBpResult?.changeCount ?? 0;
              const hasScreenshot = !!pageBpResult?.prodScreenshot;
              const dotMod = !hasScreenshot ? "disabled" : pageChanges > 0 ? "warning" : "success";
              return (
                <button
                  key={page.pageId}
                  onClick={() => { onSelect(page.pageId); setOpen(false); }}
                  className={`dropdown-item ${isCurrent ? "dropdown-item--active" : ""}`}
                >
                  <span className="dropdown-item__label">{label}</span>
                  <span className={`status-dot status-dot--${dotMod}`} />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
