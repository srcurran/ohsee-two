"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import BreakpointTabs from "@/components/BreakpointTabs";
import VariantTabs from "@/components/VariantTabs";
import ChangeBadge from "@/components/ChangeBadge";
import { useSidebar } from "@/components/SidebarProvider";
import { formatRelativeTime, formatFullDateTime } from "@/lib/relative-time";
import type { Report, Project, ReportPage } from "@/lib/types";
import { reportDotColor } from "@/lib/colors";

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
  const [project, setProject] = useState<Project | null>(null);
  const [allReports, setAllReports] = useState<Report[]>([]);
  const [showReportNav, setShowReportNav] = useState(false);
  const activeBp = Number(searchParams.get("bp")) || 1024;
  const activeVariant = searchParams.get("variant") || null;

  const loadReport = async () => {
    const res = await fetch(`/api/reports/${params.reportId}`);
    if (res.ok) {
      const r = await res.json();
      setReport(r);
      if (!project) {
        const pRes = await fetch(`/api/projects/${r.projectId}`);
        if (pRes.ok) {
          const p = await pRes.json();
          setProject(p);
          // Also load all reports for the dropdown
          const allRes = await fetch(`/api/projects/${r.projectId}/reports`);
          if (allRes.ok) setAllReports(await allRes.json());
        }
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
    const res = await fetch(`/api/projects/${project.id}/reports`, {
      method: "POST",
    });
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

  if (!report) {
    return (
      <div className="p-[24px]">
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  const displayUrl = project ? getDomain(project.prodUrl) : "...";
  const progressCompleted = report.progress?.completed || 0;
  const progressTotal = report.progress?.total || 1;

  // Helper: get breakpoint data for a page, respecting active variant
  const getPageBp = (page: ReportPage, bp: string) => {
    if (activeVariant && page.variants?.[activeVariant]) {
      return page.variants[activeVariant][bp];
    }
    return page.breakpoints[bp];
  };

  // Discover which variants exist in this report
  const reportVariants = useMemo(() => {
    const ids = new Set<string>();
    for (const page of report.pages) {
      if (page.variants) {
        for (const vid of Object.keys(page.variants)) ids.add(vid);
      }
    }
    return Array.from(ids);
  }, [report.pages]);

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
    <div>
      {/* Sticky top nav */}
      <div className="sticky top-0 z-10 rounded-t-[12px] bg-surface-content">
        <div className="flex flex-col gap-[16px] px-[24px] py-[20px]">
          {/* Domain title */}
          <p className="text-[48px] text-foreground">{displayUrl}</p>

          <div className="flex items-start justify-between">
            {/* Date with report dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowReportNav(!showReportNav)}
                className="group flex items-center gap-[12px] rounded-[8px] pr-[4px] transition-all hover:bg-foreground/[0.03]"
              >
                <span
                  className="text-[32px] text-foreground"
                  title={formatFullDateTime(report.createdAt)}
                >
                  {formatRelativeTime(report.createdAt)}
                </span>
                <span className={`inline-block h-[10px] w-[10px] shrink-0 rounded-full ${reportDotColor(report)}`} />
                <span className="flex h-[32px] w-[32px] items-center justify-center rounded-[6px] bg-foreground/[0.06] text-text-muted transition-colors group-hover:bg-foreground/10 group-hover:text-foreground">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path
                      d="M4.5 6.75l4.5 4.5 4.5-4.5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>
              {showReportNav && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowReportNav(false)}
                  />
                  <div className="absolute left-0 top-[52px] z-40 flex min-w-[320px] flex-col gap-[4px] rounded-[12px] bg-surface-content p-[12px] shadow-elevation-lg">
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

            {/* Run button (hidden while running) */}
            {report.status !== "running" && (
              <button
                onClick={handleRun}
                className="flex items-center gap-[16px] rounded-full border border-border-strong px-[20px] py-[10px] text-[20px] text-foreground transition-all hover:bg-surface-tertiary hover:shadow-elevation-md hover:-translate-y-[1px]"
              >
                Run
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <path
                    d="M8 5v18l16-9L8 5z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Progress indicator */}
          {report.status === "running" && (
            <div className="mt-[12px] flex flex-col gap-[8px]">
              <div className="flex items-center gap-[12px]">
                <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-surface-tertiary">
                  <div
                    className="h-full rounded-full bg-accent-primary transition-all duration-500"
                    style={{
                      width: `${(progressCompleted / progressTotal) * 100}%`,
                    }}
                  />
                </div>
                <span className="shrink-0 text-[13px] text-text-muted">
                  {progressCompleted} / {progressTotal}
                </span>
                <button
                  onClick={handleCancel}
                  className="shrink-0 text-[13px] text-status-error underline hover:text-status-error-text"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Cancelled state */}
          {report.status === "cancelled" && (
            <div className="mt-[12px] rounded-[8px] border border-border-primary bg-surface-tertiary p-[16px]">
              <p className="text-[13px] text-text-muted">Report was cancelled.</p>
            </div>
          )}

          {/* Error state */}
          {report.status === "failed" && (
            <div className="mt-[12px] rounded-[8px] border border-status-error-border bg-status-error-muted p-[16px]">
              <p className="text-[13px] font-bold text-status-error-strong">Report failed</p>
              {report.error && (
                <pre className="mt-[8px] max-h-[200px] overflow-auto whitespace-pre-wrap text-[12px] text-status-error-text">
                  {report.error}
                </pre>
              )}
            </div>
          )}
        </div>

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
          />
        </div>
      </div>

      {/* Page grid */}
      <div className="p-[24px]">
        <div className="grid grid-cols-3 gap-[24px]">
          {report.pages.map((page) => {
            const bpResult = getPageBp(page, String(activeBp));
            const changeCount = bpResult?.changeCount || 0;
            const diffSrc = bpResult?.diffScreenshot
              ? `/api/screenshots/${bpResult.diffScreenshot}`
              : null;

            const variantParam = activeVariant ? `&variant=${activeVariant}` : "";
            return (
              <Link
                key={page.id}
                href={`/reports/${report.id}/pages/${page.pageId}?bp=${activeBp}${variantParam}`}
                className="flex flex-col gap-[8px] rounded-[8px] bg-surface-primary p-[8px] transition-all hover:shadow-elevation-md hover:-translate-y-[1px]"
              >
                <div className="relative aspect-[2880/1760] w-full overflow-hidden border border-border-primary">
                  {diffSrc ? (
                    <img
                      src={diffSrc}
                      alt={page.path}
                      className="absolute inset-0 h-full w-full object-cover object-top"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-surface-tertiary text-[12px] text-text-subtle">
                      No screenshot
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="truncate text-[14px] text-foreground">
                    {page.path}
                  </span>
                  <ChangeBadge count={changeCount} />
                </div>
              </Link>
            );
          })}
        </div>

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
