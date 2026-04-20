"use client";

import { useEffect, useState, useRef, useMemo, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import BreakpointTabs from "@/components/BreakpointTabs";
import VariantTabs from "@/components/VariantTabs";
import DiffViewer from "@/components/DiffViewer";
import SliderComparison, { ComparisonHeader, type ComparisonMode } from "@/components/SliderComparison";
import ChangeList from "@/components/ChangeList";
import { useSidebar, usePageTitle } from "@/components/SidebarProvider";
import { formatRelativeTime, formatFullDateTime } from "@/lib/relative-time";
import type { Report, Project, SemanticChange } from "@/lib/types";
import { reportDotModifier } from "@/lib/colors";
import { countUniqueSemanticChanges } from "@/lib/change-identity";

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function PageDetailInner() {
  const params = useParams<{ reportId: string; pageId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshProjects: _refreshProjects } = useSidebar();
  const [report, setReport] = useState<Report | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [allReports, setAllReports] = useState<Report[]>([]);
  const [showPageNav, setShowPageNav] = useState(false);
  const [showReportNav, setShowReportNav] = useState(false);
  const [highlightedChangeId, setHighlightedChangeId] = useState<string | null>(null);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("tap");
  const [showingDev, setShowingDev] = useState(false);
  const activeBp = Number(searchParams.get("bp")) || 1024;
  const activeVariant = searchParams.get("variant") || null;

  usePageTitle(project ? project.name || getDomain(project.prodUrl) : null);

  useEffect(() => {
    fetch(`/api/reports/${params.reportId}`)
      .then((r) => r.json())
      .then((r) => {
        setReport(r);
        fetch(`/api/projects/${r.projectId}`)
          .then((pr) => pr.json())
          .then((p) => {
            setProject(p);
            fetch(`/api/projects/${p.id}/reports`)
              .then((res) => res.json())
              .then((reports) => setAllReports(reports));
          });
      });
  }, [params.reportId]);

  useEffect(() => {
    if (!report) return;
    const idx = report.pages.findIndex((p) => p.pageId === params.pageId);
    if (idx < 0) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft" && idx > 0) {
        e.preventDefault();
        router.push(`/reports/${report.id}/pages/${report.pages[idx - 1].pageId}?bp=${activeBp}`);
      } else if (e.key === "ArrowRight" && idx < report.pages.length - 1) {
        e.preventDefault();
        router.push(`/reports/${report.id}/pages/${report.pages[idx + 1].pageId}?bp=${activeBp}`);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [report, params.pageId, activeBp, router]);

  const handleBpChange = (bp: number) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("bp", String(bp));
    router.push(`?${p.toString()}`, { scroll: false });
  };

  const reportVariants = useMemo(() => {
    if (!report) return [];
    const ids = new Set<string>();
    for (const page of report.pages) {
      if (page.variants) {
        for (const vid of Object.keys(page.variants)) ids.add(vid);
      }
    }
    return Array.from(ids);
  }, [report]);

  if (!report) {
    return (
      <div style={{ padding: "var(--space-6)" }}>
        <p className="loader-text">Loading...</p>
      </div>
    );
  }

  const currentIndex = report.pages.findIndex((p) => p.pageId === params.pageId);
  const currentPage = currentIndex >= 0 ? report.pages[currentIndex] : null;

  if (!currentPage) {
    return (
      <div style={{ padding: "var(--space-6)" }}>
        <p className="loader-text">Page not found in report.</p>
      </div>
    );
  }

  const prevPage = currentIndex > 0 ? report.pages[currentIndex - 1] : null;
  const nextPage = currentIndex < report.pages.length - 1 ? report.pages[currentIndex + 1] : null;

  const activeBpData = activeVariant && currentPage.variants?.[activeVariant]
    ? currentPage.variants[activeVariant]
    : currentPage.breakpoints;
  const bpResult = activeBpData[String(activeBp)];

  const handleVariantChange = (variantId: string | null) => {
    const p = new URLSearchParams(searchParams.toString());
    if (variantId) {
      p.set("variant", variantId);
    } else {
      p.delete("variant");
    }
    router.push(`?${p.toString()}`, { scroll: false });
  };

  const displayUrl = project ? (project.name || getDomain(project.prodUrl)) : "...";
  const dateStr = formatRelativeTime(report.createdAt);
  const pageName = currentPage.stepLabel
    ? currentPage.stepLabel
    : currentPage.path === "/"
      ? "index"
      : currentPage.path.replace(/^\//, "");

  const totalUniqueChanges = countUniqueSemanticChanges(
    Object.values(activeBpData).map((bp) => bp.semanticChanges),
  );

  const bpChangeCounts: Record<string, number> = {};
  for (const [key, val] of Object.entries(activeBpData)) {
    bpChangeCounts[key] = val.changeCount < 0 ? -1 : (val.semanticChanges?.length ?? 0);
  }

  const badgeMod = totalUniqueChanges > 0 ? "badge--warning-tint" : "badge--success-tint";

  return (
    <div className="report-page">
      <div className="report-page__sticky">
        <div className="report-page__header">
          <div className="report-page__title-row">
            <div className="report-page__title-group">
              <div className="report-page__title-inner">
                <Link
                  href={`/reports/${params.reportId}?bp=${activeBp}`}
                  className="report-page__domain"
                >
                  {displayUrl}
                </Link>
                <span className="report-page__slash">/</span>

                <div className="report-page__page-name-wrap">
                  <button
                    onClick={() => { setShowPageNav(!showPageNav); setShowReportNav(false); }}
                    className="report-page__page-btn"
                    title={pageName}
                  >
                    <span className="report-page__page-name">{pageName}</span>
                  </button>
                  {showPageNav && (
                    <>
                      <div
                        className="dropdown-backdrop"
                        onClick={() => setShowPageNav(false)}
                      />
                      <div
                        className="dropdown-panel"
                        style={{ position: "absolute", left: 0, top: 56, zIndex: 40 }}
                      >
                        {report.pages.map((page) => {
                          const label = page.stepLabel
                            ? page.stepLabel
                            : page.path === "/"
                              ? "index"
                              : page.path.replace(/^\//, "");
                          const isCurrent = page.pageId === params.pageId;
                          const pageBpResult = page.breakpoints[String(activeBp)];
                          const pageChanges = pageBpResult?.changeCount ?? 0;
                          const dotMod = pageChanges > 0 ? "warning" : "success";
                          return (
                            <Link
                              key={page.pageId}
                              href={`/reports/${report.id}/pages/${page.pageId}?bp=${activeBp}`}
                              onClick={() => setShowPageNav(false)}
                              className={`dropdown-item ${isCurrent ? "dropdown-item--active" : ""}`}
                            >
                              <span className="dropdown-item__truncate">{label}</span>
                              <span className={`status-dot status-dot--${dotMod}`} />
                            </Link>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <span className={`badge badge--xl ${badgeMod}`}>
                {totalUniqueChanges}
              </span>
            </div>

            <div className="report-page__nav">
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => { setShowReportNav(!showReportNav); setShowPageNav(false); }}
                  className="report-page__date-btn"
                  title={formatFullDateTime(report.createdAt)}
                >
                  {dateStr}
                  <span className={`status-dot status-dot--${reportDotModifier(report)}`} />
                </button>
                {showReportNav && (
                  <>
                    <div
                      className="dropdown-backdrop"
                      onClick={() => setShowReportNav(false)}
                    />
                    <div className="dropdown-panel" style={{ position: "absolute", right: 0, top: 32, zIndex: 40 }}>
                      {allReports.map((r) => {
                        const isCurrent = r.id === report.id;
                        return (
                          <Link
                            key={r.id}
                            href={`/reports/${r.id}/pages/${params.pageId}?bp=${activeBp}`}
                            onClick={() => setShowReportNav(false)}
                            title={formatFullDateTime(r.createdAt)}
                            className={`dropdown-item ${isCurrent ? "dropdown-item--active" : "dropdown-item--muted"}`}
                          >
                            <span className="dropdown-item__label">{formatRelativeTime(r.createdAt)}</span>
                            <span className={`status-dot status-dot--${reportDotModifier(r)}`} />
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {prevPage ? (
                <Link
                  href={`/reports/${report.id}/pages/${prevPage.pageId}?bp=${activeBp}`}
                  className="report-page__arrow"
                  title={prevPage.path === "/" ? "index" : prevPage.path.replace(/^\//, "")}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              ) : (
                <span className="report-page__arrow report-page__arrow--disabled">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}

              {nextPage ? (
                <Link
                  href={`/reports/${report.id}/pages/${nextPage.pageId}?bp=${activeBp}`}
                  className="report-page__arrow"
                  title={nextPage.path === "/" ? "index" : nextPage.path.replace(/^\//, "")}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              ) : (
                <span className="report-page__arrow report-page__arrow--disabled">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}

              <Link
                href={`/reports/${params.reportId}?bp=${activeBp}`}
                className="report-page__arrow"
                title="Back to report"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        <VariantTabs
          variants={reportVariants}
          active={activeVariant}
          onChange={handleVariantChange}
        />

        <div style={{ padding: "0 var(--space-5)" }}>
          <BreakpointTabs
            active={activeBp}
            onChange={handleBpChange}
            changeCounts={bpChangeCounts}
            breakpoints={project?.breakpoints}
          />
        </div>

        {bpResult && (
          <div className="report-page__headers">
            <div className="report-page__header-col">
              <span>Changes</span>
            </div>
            <div className="report-page__header-col">
              <ComparisonHeader mode={comparisonMode} onModeChange={setComparisonMode} showingDev={showingDev} />
            </div>
          </div>
        )}
      </div>

      <div className="report-page__body">
        {bpResult ? (
          <div className="report-page__compare-row">
            <div className="report-page__compare-col">
              <DiffViewer
                src={`/api/screenshots/${bpResult.diffScreenshot}`}
                alt={`Diff for ${currentPage.path}`}
                changes={bpResult.semanticChanges}
                highlightedChangeId={highlightedChangeId}
              />
            </div>
            <div className="report-page__compare-col">
              <SliderComparison
                prodSrc={`/api/screenshots/${bpResult.alignedProdScreenshot ?? bpResult.prodScreenshot}`}
                devSrc={`/api/screenshots/${bpResult.alignedDevScreenshot ?? bpResult.devScreenshot}`}
                mode={comparisonMode}
                onModeChange={setComparisonMode}
                onPressedChange={setShowingDev}
                hideHeader
              />
            </div>
          </div>
        ) : (
          <p className="loader-text" style={{ textAlign: "center" }}>
            No screenshot available for this breakpoint.
          </p>
        )}

        {bpResult?.semanticChanges && bpResult.semanticChanges.length > 0 && (
          <CollapsibleIssues
            changes={bpResult.semanticChanges}
            summary={bpResult.changeSummary}
            onIssueClick={(id) => {
              setHighlightedChangeId(id);
              setTimeout(() => setHighlightedChangeId(null), 3000);
            }}
          />
        )}

        <ScrollToTopButton />
      </div>
    </div>
  );
}

function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="scroll-to-top"
      aria-label="Scroll to top"
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M10 15V5M10 5l-4 4M10 5l4 4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function CollapsibleIssues({
  changes,
  summary,
  onIssueClick,
}: {
  changes: SemanticChange[];
  summary?: Record<string, number>;
  onIssueClick: (id: string) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const check = () => {
      const maxH = window.innerHeight * 0.4;
      setIsOverflowing(el.scrollHeight > maxH);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [changes]);

  const collapsed = isOverflowing && !expanded;

  return (
    <div>
      <div className="report-page__collapsible">
        <div
          ref={contentRef}
          className="report-page__collapsible-inner"
          style={{ maxHeight: collapsed ? "40vh" : "none" }}
        >
          <ChangeList
            changes={changes}
            summary={summary}
            onChangeClick={onIssueClick}
          />
        </div>
        {collapsed && (
          <div className="report-page__fade">
            <button
              onClick={() => setExpanded(true)}
              className="report-page__show-all"
            >
              Show all {changes.length} issues
            </button>
          </div>
        )}
      </div>
      {expanded && isOverflowing && (
        <button
          onClick={() => setExpanded(false)}
          className="report-page__collapse"
        >
          Collapse
        </button>
      )}
    </div>
  );
}

export default function PageDetailPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: "var(--space-6)" }}>
          <p className="loader-text">Loading...</p>
        </div>
      }
    >
      <PageDetailInner />
    </Suspense>
  );
}
