"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import BreakpointTabs from "@/components/BreakpointTabs";
import DiffViewer from "@/components/DiffViewer";
import SliderComparison, { ComparisonHeader, type ComparisonMode } from "@/components/SliderComparison";
import ChangeList from "@/components/ChangeList";
import { useSidebar } from "@/components/SidebarProvider";
import { formatRelativeTime, formatFullDateTime } from "@/lib/relative-time";
import type { Report, Project, SemanticChange } from "@/lib/types";
import { reportDotColor } from "@/lib/colors";

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
  const { refreshProjects } = useSidebar();
  const [report, setReport] = useState<Report | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [allReports, setAllReports] = useState<Report[]>([]);
  const [showPageNav, setShowPageNav] = useState(false);
  const [showReportNav, setShowReportNav] = useState(false);
  const [highlightedChangeId, setHighlightedChangeId] = useState<string | null>(null);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("tap");
  const activeBp = Number(searchParams.get("bp")) || 1024;

  useEffect(() => {
    fetch(`/api/reports/${params.reportId}`)
      .then((r) => r.json())
      .then((r) => {
        setReport(r);
        fetch(`/api/projects/${r.projectId}`)
          .then((pr) => pr.json())
          .then((p) => {
            setProject(p);
            // Fetch all reports for this project
            fetch(`/api/projects/${p.id}/reports`)
              .then((res) => res.json())
              .then((reports) => setAllReports(reports));
          });
      });
  }, [params.reportId]);

  // Keyboard navigation: left/right arrows to page through pages
  useEffect(() => {
    if (!report) return;
    const idx = report.pages.findIndex((p) => p.pageId === params.pageId);
    if (idx < 0) return;

    const handleKey = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
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

  const handleRun = async () => {
    if (!project) return;
    const res = await fetch(`/api/projects/${project.id}/reports`, {
      method: "POST",
    });
    if (res.ok) {
      const { reportId } = await res.json();
      refreshProjects();
      router.push(`/reports/${reportId}`);
    }
  };

  if (!report) {
    return (
      <div className="p-[24px]">
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  const currentIndex = report.pages.findIndex((p) => p.pageId === params.pageId);
  const currentPage = currentIndex >= 0 ? report.pages[currentIndex] : null;

  if (!currentPage) {
    return (
      <div className="p-[24px]">
        <p className="text-text-muted">Page not found in report.</p>
      </div>
    );
  }

  const prevPage = currentIndex > 0 ? report.pages[currentIndex - 1] : null;
  const nextPage = currentIndex < report.pages.length - 1 ? report.pages[currentIndex + 1] : null;

  const bpResult = currentPage.breakpoints[String(activeBp)];
  const displayUrl = project ? getDomain(project.prodUrl) : "...";
  const dateStr = formatRelativeTime(report.createdAt);
  const pageName =
    currentPage.path === "/"
      ? "index"
      : currentPage.path.replace(/^\//, "");

  // Compute total change count for current page (across all breakpoints)
  const totalChangeCount = Object.values(currentPage.breakpoints).reduce(
    (sum, bp) => sum + (bp.changeCount || 0),
    0
  );

  // Change counts per breakpoint for the tab dots
  const bpChangeCounts: Record<string, number> = {};
  for (const [key, val] of Object.entries(currentPage.breakpoints)) {
    bpChangeCounts[key] = val.changeCount || 0;
  }

  return (
    <div>
      {/* Sticky top nav */}
      <div className="sticky top-0 z-10 rounded-t-[12px] bg-surface-content">
        <div className="flex flex-col gap-[16px] px-[20px] py-[24px] pb-0">
          {/* Title row */}
          <div className="flex items-center justify-between gap-[16px]">
            {/* Left: domain link + page path dropdown + change count badge */}
            <div className="flex min-w-0 max-w-[66%] items-center gap-[16px]">
              <div className="flex min-w-0 items-baseline gap-[4px]">
                {/* Domain — links back to report */}
                <Link
                  href={`/reports/${params.reportId}?bp=${activeBp}`}
                  className="shrink-0 text-[36px] text-foreground hover:opacity-70"
                >
                  {displayUrl}
                </Link>
                <span className="shrink-0 text-[36px] text-text-subtle">/</span>

                {/* Page path — opens page dropdown */}
                <div className="relative min-w-0">
                  <button
                    onClick={() => { setShowPageNav(!showPageNav); setShowReportNav(false); }}
                    className="block max-w-full truncate rounded-[8px] transition-all hover:bg-foreground/[0.03]"
                    title={pageName}
                  >
                    <span className="text-[36px] text-foreground">{pageName}</span>
                  </button>
                  {showPageNav && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setShowPageNav(false)}
                      />
                      <div className="absolute left-0 top-[56px] z-40 flex min-w-[280px] max-w-[400px] flex-col gap-[4px] rounded-[12px] bg-surface-content p-[12px] shadow-elevation-lg">
                        {report.pages.map((page) => {
                          const label =
                            page.path === "/"
                              ? "index"
                              : page.path.replace(/^\//, "");
                          const isCurrent = page.pageId === params.pageId;
                          const pageBpResult = page.breakpoints[String(activeBp)];
                          const pageChanges = pageBpResult?.changeCount ?? 0;
                          return (
                            <Link
                              key={page.pageId}
                              href={`/reports/${report.id}/pages/${page.pageId}?bp=${activeBp}`}
                              onClick={() => setShowPageNav(false)}
                              className={`flex items-center gap-[8px] rounded-[8px] px-[12px] py-[6px] text-[14px] text-foreground ${
                                isCurrent
                                  ? "bg-surface-tertiary font-bold"
                                  : "font-normal hover:bg-surface-tertiary"
                              }`}
                            >
                              <span className="truncate">{label}</span>
                              <span className={`inline-block h-[8px] w-[8px] shrink-0 rounded-full ${
                                pageChanges > 0 ? "bg-accent-yellow" : "bg-accent-green"
                              }`} />
                            </Link>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Change count badge */}
              <span className={`flex h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-full px-[8px] text-[20px] text-foreground ${
                bpResult && bpResult.changeCount > 0 ? "bg-accent-yellow-tint" : "bg-accent-green-tint"
              }`}>
                {bpResult?.changeCount ?? 0}
              </span>
            </div>

            {/* Right: time dropdown + arrows + close */}
            <div className="flex shrink-0 items-center gap-[24px]">
              {/* Date — opens report dropdown */}
              <div className="relative">
                <button
                  onClick={() => { setShowReportNav(!showReportNav); setShowPageNav(false); }}
                  className="flex items-center gap-[8px] text-[16px] text-foreground hover:opacity-70"
                  title={formatFullDateTime(report.createdAt)}
                >
                  {dateStr}
                  <span className={`inline-block h-[8px] w-[8px] shrink-0 rounded-full ${reportDotColor(report)}`} />
                </button>
                {showReportNav && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setShowReportNav(false)}
                    />
                    <div className="absolute right-0 top-[32px] z-40 flex min-w-[280px] flex-col gap-[4px] rounded-[12px] bg-surface-content p-[12px] shadow-elevation-lg">
                      {allReports.map((r) => {
                        const isCurrent = r.id === report.id;
                        return (
                          <Link
                            key={r.id}
                            href={`/reports/${r.id}/pages/${params.pageId}?bp=${activeBp}`}
                            onClick={() => setShowReportNav(false)}
                            title={formatFullDateTime(r.createdAt)}
                            className={`flex items-center gap-[8px] rounded-[8px] px-[12px] py-[8px] text-[14px] ${
                              isCurrent
                                ? "bg-surface-tertiary font-bold text-foreground"
                                : "text-text-secondary hover:bg-surface-tertiary"
                            }`}
                          >
                            <span className="flex-1">{formatRelativeTime(r.createdAt)}</span>
                            <span className={`inline-block h-[8px] w-[8px] shrink-0 rounded-full ${reportDotColor(r)}`} />
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Prev arrow */}
              {prevPage ? (
                <Link
                  href={`/reports/${report.id}/pages/${prevPage.pageId}?bp=${activeBp}`}
                  className="flex h-[24px] w-[24px] items-center justify-center text-text-subtle transition-colors hover:text-foreground"
                  title={prevPage.path === "/" ? "index" : prevPage.path.replace(/^\//, "")}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              ) : (
                <span className="flex h-[24px] w-[24px] items-center justify-center text-text-disabled">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}

              {/* Next arrow */}
              {nextPage ? (
                <Link
                  href={`/reports/${report.id}/pages/${nextPage.pageId}?bp=${activeBp}`}
                  className="flex h-[24px] w-[24px] items-center justify-center text-text-subtle transition-colors hover:text-foreground"
                  title={nextPage.path === "/" ? "index" : nextPage.path.replace(/^\//, "")}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              ) : (
                <span className="flex h-[24px] w-[24px] items-center justify-center text-text-disabled">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}

              {/* Close (back to report) */}
              <Link
                href={`/reports/${params.reportId}?bp=${activeBp}`}
                className="flex h-[24px] w-[24px] items-center justify-center text-text-subtle transition-colors hover:text-foreground"
                title="Back to report"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        {/* Breakpoint tabs */}
        <div className="px-[20px]">
          <BreakpointTabs
            active={activeBp}
            onChange={handleBpChange}
            changeCounts={bpChangeCounts}
          />
        </div>

        {/* Column headers */}
        {bpResult && (
          <div className="flex gap-[29px] px-[20px] pb-[8px] pt-[16px]">
            <div className="flex flex-1 items-center text-[14px] text-foreground">
              <span>Changes</span>
            </div>
            <div className="flex-1">
              <ComparisonHeader mode={comparisonMode} onModeChange={setComparisonMode} />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col gap-[16px] px-[20px] py-[24px]">
        {bpResult ? (
          <div className="flex gap-[29px]">
            {/* Changes (diff) column */}
            <div className="flex-1">
              <DiffViewer
                src={`/api/screenshots/${bpResult.diffScreenshot}`}
                alt={`Diff for ${currentPage.path}`}
                changes={bpResult.semanticChanges}
                highlightedChangeId={highlightedChangeId}
              />
            </div>
            {/* Prod / Dev comparison column */}
            <div className="flex-1">
              <SliderComparison
                prodSrc={`/api/screenshots/${bpResult.alignedProdScreenshot ?? bpResult.prodScreenshot}`}
                devSrc={`/api/screenshots/${bpResult.alignedDevScreenshot ?? bpResult.devScreenshot}`}
                mode={comparisonMode}
                onModeChange={setComparisonMode}
                hideHeader
              />
            </div>
          </div>
        ) : (
          <p className="text-center text-[14px] text-text-muted">
            No screenshot available for this breakpoint.
          </p>
        )}

        {/* Issues list (collapsible) */}
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

        {/* Jump to top */}
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
      className="fixed bottom-[32px] right-[32px] z-50 flex h-[44px] w-[44px] items-center justify-center rounded-full bg-black/70 text-white shadow-lg transition-opacity hover:bg-black"
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
      <div className="relative">
        <div
          ref={contentRef}
          className="overflow-hidden transition-[max-height] duration-300"
          style={{ maxHeight: collapsed ? "40vh" : "none" }}
        >
          <ChangeList
            changes={changes}
            summary={summary}
            onChangeClick={onIssueClick}
          />
        </div>
        {collapsed && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center bg-gradient-to-t from-surface-fade-from via-surface-fade-via to-transparent pt-[40px] pb-[8px]">
            <button
              onClick={() => setExpanded(true)}
              className="rounded-full border border-border-primary bg-surface-content px-[20px] py-[8px] text-[13px] text-foreground shadow-sm transition-all hover:bg-surface-tertiary hover:shadow-elevation-sm"
            >
              Show all {changes.length} issues
            </button>
          </div>
        )}
      </div>
      {expanded && isOverflowing && (
        <button
          onClick={() => setExpanded(false)}
          className="mt-[8px] text-[13px] text-text-muted underline hover:text-foreground"
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
        <div className="p-[24px]">
          <p className="text-text-muted">Loading...</p>
        </div>
      }
    >
      <PageDetailInner />
    </Suspense>
  );
}
