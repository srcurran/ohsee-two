"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import BreakpointTabs from "@/components/BreakpointTabs";
import VariantTabs from "@/components/VariantTabs";
import ChangeBadge from "@/components/ChangeBadge";
import { useSidebar } from "@/components/SidebarProvider";
import { formatRelativeTime, formatFullDateTime } from "@/lib/relative-time";
import type { Report, Project, SiteTest, ReportPage } from "@/lib/types";
import { reportDotColor } from "@/lib/colors";
import PageDetailPanel from "@/components/PageDetailPanel";

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function ReportPageInner() {
  const params = useParams<{ reportId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshProjects } = useSidebar();
  const [report, setReport] = useState<Report | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [allReports, setAllReports] = useState<Report[]>([]);
  const [siteTest, setSiteTest] = useState<SiteTest | null>(null);
  const [showReportNav, setShowReportNav] = useState(false);
  const [pageOriginRect, setPageOriginRect] = useState<DOMRect | null>(null);
  const [pageOriginThumb, setPageOriginThumb] = useState<{ rect: DOMRect; src: string } | null>(null);
  const activeBp = Number(searchParams.get("bp")) || 1024;
  const activeVariant = searchParams.get("variant") || null;
  const activePageId = searchParams.get("page") || null;

  const loadReport = async () => {
    const res = await fetch(`/api/reports/${params.reportId}`);
    if (!res.ok) {
      setNotFound(true);
      return;
    }
    const r = await res.json();
    setReport(r);
    if (!project) {
      const pRes = await fetch(`/api/projects/${r.projectId}`);
      if (pRes.ok) {
        const p = await pRes.json();
        setProject(p);
        // Resolve the site test for this report
        if (r.siteTestId && p.tests) {
          const test = p.tests.find((t: SiteTest) => t.id === r.siteTestId);
          if (test) setSiteTest(test);
        }
        // Load reports filtered by siteTestId (or all if no test)
        const reportsUrl = r.siteTestId
          ? `/api/projects/${r.projectId}/tests/${r.siteTestId}/reports`
          : `/api/projects/${r.projectId}/reports`;
        const allRes = await fetch(reportsUrl);
        if (allRes.ok) setAllReports(await allRes.json());
      }
    }
  };

  useEffect(() => {
    loadReport();
    const interval = setInterval(async () => {
      const res = await fetch(`/api/reports/${params.reportId}`);
      if (res.ok) {
        const r = await res.json();
        setReport(r);
        if (r.status !== "running") clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [params.reportId]);

  const handleBpChange = (bp: number) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("bp", String(bp));
    router.push(`?${p.toString()}`, { scroll: false });
  };

  const openPage = (pageId: string, e?: React.MouseEvent) => {
    if (e) {
      const card = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPageOriginRect(card);
      // Find the thumbnail image inside the card
      const img = (e.currentTarget as HTMLElement).querySelector("img");
      if (img) {
        setPageOriginThumb({ rect: img.getBoundingClientRect(), src: img.src });
      } else {
        setPageOriginThumb(null);
      }
    }
    const p = new URLSearchParams(searchParams.toString());
    p.set("page", pageId);
    router.push(`?${p.toString()}`, { scroll: false });
  };

  const closePage = () => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("page");
    router.push(`?${p.toString()}`, { scroll: false });
  };

  const handleVariantChange = (variantId: string | null) => {
    const p = new URLSearchParams(searchParams.toString());
    if (variantId) {
      p.set("variant", variantId);
    } else {
      p.delete("variant");
    }
    router.push(`?${p.toString()}`, { scroll: false });
  };

  const handleRun = async () => {
    if (!project) return;
    // Use test-scoped endpoint if we know which test this report belongs to
    const url = report?.siteTestId
      ? `/api/projects/${project.id}/tests/${report.siteTestId}/reports`
      : `/api/projects/${project.id}/reports`;
    const res = await fetch(url, { method: "POST" });
    if (res.ok) {
      const { reportId } = await res.json();
      refreshProjects();
      router.push(`/reports/${reportId}`);
    }
  };

  const handleCancel = async () => {
    const res = await fetch(`/api/reports/${params.reportId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setReport((prev) => prev ? { ...prev, status: "cancelled" } : prev);
      refreshProjects();
    }
  };

  // Discover which variants exist in this report (must be before early return)
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

  // Report not found or not owned — clear stale path and go home
  useEffect(() => {
    if (notFound) {
      localStorage.removeItem("ohsee-last-path");
      router.replace("/");
    }
  }, [notFound, router]);

  if (!report) {
    return (
      <div className="p-[24px]">
        <p className="text-text-muted">{notFound ? "Redirecting..." : "Loading..."}</p>
      </div>
    );
  }

  const projectName = project ? (project.name || getDomain(project.prodUrl)) : "...";
  const hasMultipleTests = (project?.tests?.length ?? 0) > 1;
  const displayUrl = hasMultipleTests && siteTest
    ? `${projectName} › ${siteTest.name}`
    : projectName;
  const progressCompleted = report.progress?.completed || 0;
  const progressTotal = report.progress?.total || 1;

  // Helper: get breakpoint data for a page, respecting active variant
  const getPageBp = (page: ReportPage, bp: string) => {
    if (activeVariant && page.variants?.[activeVariant]) {
      return page.variants[activeVariant][bp];
    }
    return page.breakpoints[bp];
  };

  // Derive the breakpoints actually used in this report from the data itself
  const reportBreakpoints: number[] = (() => {
    const bpSet = new Set<number>();
    for (const page of report.pages) {
      for (const bp of Object.keys(page.breakpoints)) bpSet.add(Number(bp));
    }
    return [...bpSet].sort((a, b) => a - b);
  })();

  // Sum change counts per breakpoint across all pages (variant-aware)
  const bpChangeCounts: Record<string, number> = {};
  for (const page of report.pages) {
    const bpData = activeVariant && page.variants?.[activeVariant]
      ? page.variants[activeVariant]
      : page.breakpoints;
    for (const [bp, result] of Object.entries(bpData)) {
      bpChangeCounts[bp] = (bpChangeCounts[bp] || 0) + (result.changeCount || 0);
    }
  }

  return (
    <div className="relative min-h-full overflow-hidden">
      {/* Page detail panel */}
      {activePageId && report && project && (
        <PageDetailPanel
          report={report}
          project={project}
          pageId={activePageId}
          initialBp={activeBp}
          initialVariant={activeVariant}
          originRect={pageOriginRect}
          originThumb={pageOriginThumb}
          onClose={() => { closePage(); setPageOriginRect(null); setPageOriginThumb(null); }}
          onNavigate={(pid) => openPage(pid)}
          onBpChange={handleBpChange}
          onVariantChange={handleVariantChange}
        />
      )}

      {/* Sticky top nav */}
      <div className="sticky top-0 z-10 rounded-t-[12px] bg-surface-content">
        {/* Title row */}
        <div className="flex items-center justify-between px-[24px] py-[20px]">
          {/* Left: Run now pill */}
          <div className="flex shrink-0 items-center">
            {report.status !== "running" ? (
              <button
                onClick={handleRun}
                className="flex items-center gap-[16px] rounded-[8px] border border-border-strong pl-[24px] pr-[20px] py-[8px] text-[16px] text-foreground transition-all hover:bg-surface-tertiary hover:shadow-elevation-md hover:-translate-y-[1px]"
              >
                Run now
                <svg width="16" height="16" viewBox="0 0 28 28" fill="none" className="text-text-subtle">
                  <path d="M8 5v18l16-9L8 5z" fill="currentColor" />
                </svg>
              </button>
            ) : (
              <div className="flex items-center gap-[12px]">
                <div className="h-[6px] w-[120px] overflow-hidden rounded-full bg-surface-tertiary">
                  <div
                    className="h-full rounded-full bg-accent-primary transition-all duration-500"
                    style={{ width: `${(progressCompleted / progressTotal) * 100}%` }}
                  />
                </div>
                <span className="text-[13px] text-text-muted">
                  {progressCompleted}/{progressTotal}
                </span>
                <button
                  onClick={handleCancel}
                  className="text-[13px] text-status-error underline hover:text-status-error-text"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Center: Project name */}
          <p className="absolute left-1/2 -translate-x-1/2 text-[24px] text-foreground whitespace-nowrap">{displayUrl}</p>

          {/* Right: Date + status dot + settings */}
          <div className="flex shrink-0 items-center gap-[24px]">
            {/* Date with report dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowReportNav(!showReportNav)}
                className="flex items-center gap-[8px] rounded-[8px] px-[8px] py-[4px] transition-all hover:bg-foreground/[0.03]"
              >
                <span
                  className="text-[16px] text-foreground"
                  title={formatFullDateTime(report.createdAt)}
                >
                  {formatRelativeTime(report.createdAt)}
                </span>
                <span className={`inline-block h-[8px] w-[8px] shrink-0 rounded-full ${reportDotColor(report)}`} />
              </button>
              {showReportNav && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowReportNav(false)}
                  />
                  <div className="absolute right-0 top-[40px] z-40 flex min-w-[320px] flex-col gap-[4px] rounded-[12px] bg-surface-content p-[12px] shadow-elevation-lg">
                    {allReports.map((r) => {
                      const isCurrent = r.id === report.id;
                      return (
                        <Link
                          key={r.id}
                          href={`/reports/${r.id}?bp=${activeBp}`}
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

            {/* Settings icon */}
            {project && (
              <button
                onClick={() => router.push(
                  report?.siteTestId
                    ? `/projects/${project.id}/settings/tests?testId=${report.siteTestId}`
                    : `/projects/${project.id}/settings`
                )}
                className="flex h-[40px] w-[40px] items-center justify-center rounded-[10px] text-text-subtle transition-all hover:bg-foreground/[0.05] hover:text-foreground"
                title="Project settings"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="8" cy="6" r="2" fill="currentColor" />
                  <circle cx="16" cy="12" r="2" fill="currentColor" />
                  <circle cx="10" cy="18" r="2" fill="currentColor" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Status messages below title row */}
        {report.status === "cancelled" && (
          <div className="mx-[32px] mb-[12px] rounded-[8px] border border-border-primary bg-surface-tertiary p-[16px]">
            <p className="text-[13px] text-text-muted">Report was cancelled.</p>
          </div>
        )}
        {report.status === "failed" && (
          <div className="mx-[32px] mb-[12px] rounded-[8px] border border-status-error-border bg-status-error-muted p-[16px]">
            <p className="text-[13px] font-bold text-status-error-strong">Report failed</p>
            {report.error && (
              <pre className="mt-[8px] max-h-[200px] overflow-auto whitespace-pre-wrap text-[12px] text-status-error-text">
                {report.error}
              </pre>
            )}
          </div>
        )}

        {/* Variant tabs (only shown when variants exist) */}
        <VariantTabs
          variants={reportVariants}
          active={activeVariant}
          onChange={handleVariantChange}
        />

        {/* Breakpoint tabs */}
        <div className="px-[24px]">
          <BreakpointTabs
            active={activeBp}
            onChange={handleBpChange}
            changeCounts={bpChangeCounts}
            breakpoints={reportBreakpoints}
            align="start"
          />
        </div>
      </div>

      {/* Page grid */}
      <div className="p-[24px]">
        {(() => {
          const regularPages = report.pages.filter((p) => !p.flowId);
          const flowPages = report.pages.filter((p) => p.flowId);

          // Group flow pages by flowId
          const flowGroups = new Map<string, ReportPage[]>();
          for (const fp of flowPages) {
            const group = flowGroups.get(fp.flowId!) || [];
            group.push(fp);
            flowGroups.set(fp.flowId!, group);
          }

          const variantParam = activeVariant ? `&variant=${activeVariant}` : "";

          const renderPageCard = (page: ReportPage, index: number) => {
            const bpResult = getPageBp(page, String(activeBp));
            const changeCount = bpResult?.changeCount || 0;
            const hasScreenshot = !!bpResult?.prodScreenshot;
            const diffSrc = bpResult?.diffScreenshot
              ? `/api/screenshots/${bpResult.diffScreenshot}`
              : null;

            return (
              <button
                key={page.id}
                onClick={(e) => openPage(page.pageId, e)}
                className="flex flex-col gap-[8px] rounded-[8px] bg-surface-primary p-[8px] text-left shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.03)] transition-all hover:shadow-elevation-md hover:-translate-y-[1px] active:scale-[0.97] animate-card-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[4px] bg-surface-tertiary">
                  {diffSrc ? (
                    <img
                      src={diffSrc}
                      alt={page.stepLabel || page.path}
                      className="absolute inset-0 h-full w-full object-contain object-top"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-surface-tertiary text-[12px] text-text-subtle">
                      No screenshot
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-[8px] px-[4px] py-[4px]">
                  <span className="truncate text-[13px] text-text-secondary">
                    {page.stepLabel || page.path}
                  </span>
                  <ChangeBadge count={changeCount} noData={!hasScreenshot} />
                </div>
              </button>
            );
          };

          return (
            <>
              {/* Regular pages */}
              {regularPages.length > 0 && (
                <div className="grid grid-cols-3 gap-[24px]">
                  {regularPages.map((page, i) => renderPageCard(page, i))}
                </div>
              )}

              {/* Flow sections */}
              {Array.from(flowGroups.entries()).map(([flowId, pages]) => {
                // Extract flow name from the path (format: "FlowName > StepLabel")
                const flowName = pages[0]?.path.split(" > ")[0] || "Flow";
                return (
                  <div key={flowId} className={regularPages.length > 0 ? "mt-[32px]" : ""}>
                    <div className="mb-[12px] flex items-center gap-[8px]">
                      <span className="rounded-[4px] bg-accent-primary/10 px-[8px] py-[2px] text-[12px] font-bold text-accent-primary">
                        Flow
                      </span>
                      <h3 className="text-[16px] font-bold text-foreground">{flowName}</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-[24px]">
                      {pages.map((page, i) => renderPageCard(page, regularPages.length + i))}
                    </div>
                  </div>
                );
              })}
            </>
          );
        })()}

        {/* Empty states */}
        {report.pages.length === 0 && report.status === "running" && (
          <div className="flex flex-col items-center gap-[16px] py-[40px]">
            <div className="h-[32px] w-[32px] animate-spin rounded-full border-[3px] border-surface-tertiary border-t-accent-primary" />
            <p className="text-[14px] text-text-muted">
              Capturing screenshots...
            </p>
          </div>
        )}

        {report.pages.length === 0 && report.status === "failed" && (
          <p className="text-center text-[14px] text-text-muted">
            No pages were processed before the report failed.
          </p>
        )}

        {report.pages.length === 0 && report.status === "completed" && (
          <p className="text-center text-[14px] text-text-muted">
            No pages in this report.
          </p>
        )}
      </div>

    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense
      fallback={
        <div className="p-[24px]">
          <p className="text-text-muted">Loading...</p>
        </div>
      }
    >
      <ReportPageInner />
    </Suspense>
  );
}
