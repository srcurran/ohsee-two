"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import BreakpointTabs from "@/components/BreakpointTabs";
import VariantTabs from "@/components/VariantTabs";
import ChangeBadge from "@/components/ChangeBadge";
import ErrorModal, { type ErrorModalDetails } from "@/components/ErrorModal";
import { buildRunErrorDetails } from "@/components/run-error-details";
import { useSidebar, usePageTitle } from "@/components/SidebarProvider";
import { formatRelativeTime, formatFullDateTime } from "@/lib/relative-time";
import type { Report, Project, SiteTest, ReportPage } from "@/lib/types";
import { reportDotModifier } from "@/lib/colors";
import PageDetailPanel from "@/components/PageDetailPanel";
import { trackReportCompletion } from "@/lib/electron";

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
  const { refreshProjects, openProjectSettings, openTestSettings } = useSidebar();
  const [report, setReport] = useState<Report | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [allReports, setAllReports] = useState<Report[]>([]);
  const [siteTest, setSiteTest] = useState<SiteTest | null>(null);
  const [showReportNav, setShowReportNav] = useState(false);
  const [pageOriginRect, setPageOriginRect] = useState<DOMRect | null>(null);
  const [pageOriginThumb, setPageOriginThumb] = useState<{ rect: DOMRect; src: string } | null>(null);
  // Structured run-failure payload (eyebrow / title / body / hint). See
  // buildRunErrorDetails + lib/url-reachability.ts.
  const [runError, setRunError] = useState<ErrorModalDetails | null>(null);
  const activeBp = Number(searchParams.get("bp")) || 1024;
  const activeVariant = searchParams.get("variant") || null;
  const activePageId = searchParams.get("page") || null;

  const titleLabel = project
    ? siteTest
      ? `${project.name || getDomain(project.prodUrl)} / ${siteTest.name}`
      : project.name || getDomain(project.prodUrl)
    : null;
  usePageTitle(titleLabel);

  useEffect(() => {
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
          if (r.siteTestId && p.tests) {
            const test = p.tests.find((t: SiteTest) => t.id === r.siteTestId);
            if (test) setSiteTest(test);
          }
          const reportsUrl = r.siteTestId
            ? `/api/projects/${r.projectId}/tests/${r.siteTestId}/reports`
            : `/api/projects/${r.projectId}/reports`;
          const allRes = await fetch(reportsUrl);
          if (allRes.ok) setAllReports(await allRes.json());
        }
      }
    };
    loadReport();
    const interval = setInterval(async () => {
      const res = await fetch(`/api/reports/${params.reportId}`);
      if (res.ok) {
        const r = await res.json();
        setReport((prev) => {
          if (prev?.status === "running" && r.status !== "running") {
            refreshProjects();
          }
          return r;
        });
        if (r.status !== "running") clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.reportId, refreshProjects]);

  const handleBpChange = (bp: number) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("bp", String(bp));
    router.push(`?${p.toString()}`, { scroll: false });
  };

  const openPage = (pageId: string, e?: React.MouseEvent) => {
    if (e) {
      const card = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPageOriginRect(card);
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
    setRunError(null);
    const url = report?.siteTestId
      ? `/api/projects/${project.id}/tests/${report.siteTestId}/reports`
      : `/api/projects/${project.id}/reports`;
    const res = await fetch(url, { method: "POST" });
    if (res.ok) {
      const { reportId } = await res.json();
      trackReportCompletion(reportId, project.name || getDomain(project.prodUrl));
      refreshProjects();
      router.push(`/reports/${reportId}`);
    } else {
      setRunError(buildRunErrorDetails(await res.json().catch(() => null), project.id));
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

  useEffect(() => {
    if (notFound) {
      localStorage.removeItem("ohsee-last-path");
      router.replace("/");
    }
  }, [notFound, router]);

  if (!report) {
    return (
      <div style={{ padding: "var(--space-6)" }}>
        <p className="loader-text">{notFound ? "Redirecting..." : "Loading..."}</p>
      </div>
    );
  }

  const projectName = project ? (project.name || getDomain(project.prodUrl)) : "...";
  // Two-line header: project sits as a small eyebrow above the bold test
  // name. Legacy reports without a siteTest fall back to project-as-title.
  const headerEyebrow = siteTest ? projectName : null;
  const headerTitle = siteTest?.name ?? projectName;
  // Both project-level and test-level reports now open overlays. Legacy
  // reports without a siteTestId open the project settings overlay.
  const openSettings = () => {
    if (!project) return;
    if (report?.siteTestId) {
      openTestSettings(project.id, report.siteTestId);
    } else {
      openProjectSettings(project.id);
    }
  };
  const progressCompleted = report.progress?.completed || 0;
  const progressTotal = report.progress?.total || 1;

  const getPageBp = (page: ReportPage, bp: string) => {
    if (activeVariant && page.variants?.[activeVariant]) {
      return page.variants[activeVariant][bp];
    }
    return page.breakpoints[bp];
  };

  const reportBreakpoints: number[] = (() => {
    const bpSet = new Set<number>();
    for (const page of report.pages) {
      for (const bp of Object.keys(page.breakpoints)) bpSet.add(Number(bp));
    }
    return [...bpSet].sort((a, b) => a - b);
  })();

  const bpChangeCounts: Record<string, number> = {};
  for (const page of report.pages) {
    const bpData = activeVariant && page.variants?.[activeVariant]
      ? page.variants[activeVariant]
      : page.breakpoints;
    for (const [bp, result] of Object.entries(bpData)) {
      bpChangeCounts[bp] = (bpChangeCounts[bp] || 0) + (result.semanticChanges?.length ?? 0);
    }
  }

  return (
    <div className="report">
      <ErrorModal error={runError} onClose={() => setRunError(null)} />
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

      <div className="report__sticky">
        {(headerEyebrow || project) && (
          <div className="report__eyebrow-row">
            {headerEyebrow && <span className="report__project-label">{headerEyebrow}</span>}
            {project && (
              <button
                onClick={openSettings}
                className="icon-btn icon-btn--sm"
                title="Test settings"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="8" cy="6" r="2" fill="currentColor" />
                  <circle cx="16" cy="12" r="2" fill="currentColor" />
                  <circle cx="10" cy="18" r="2" fill="currentColor" />
                </svg>
              </button>
            )}
          </div>
        )}

        <div className="report__title-row">
          <div className="report__title-group">
            <h1 className="report__title">{headerTitle}</h1>
            {report.status !== "running" ? (
              <button onClick={handleRun} className="run-pill">
                Run now
                <svg width="16" height="16" viewBox="0 0 28 28" fill="none" className="run-pill__icon">
                  <path d="M8 5v18l16-9L8 5z" fill="currentColor" />
                </svg>
              </button>
            ) : (
              <div className="progress">
                <div className="progress__bar">
                  <div
                    className="progress__fill"
                    style={{ width: `${(progressCompleted / progressTotal) * 100}%` }}
                  />
                </div>
                <span className="progress__text">
                  {progressCompleted}/{progressTotal}
                </span>
                <button onClick={handleCancel} className="status-pill">
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="report__right">
            <div className="report__nav-anchor">
              <button
                onClick={() => setShowReportNav(!showReportNav)}
                className="report__date-btn"
              >
                <span
                  className="report__date"
                  title={formatFullDateTime(report.createdAt)}
                >
                  {formatRelativeTime(report.createdAt)}
                </span>
                <span className={`status-dot status-dot--${reportDotModifier(report)}`} />
              </button>
              <button
                onClick={openSettings}
                className="icon-btn"
                title={report?.siteTestId ? "Test settings" : "Project settings"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="19" r="1.5" fill="currentColor" />
                </svg>
              </button>
              {showReportNav && (
                <>
                  <div
                    className="dropdown-backdrop"
                    onClick={() => setShowReportNav(false)}
                  />
                  <div className="dropdown-panel" style={{ position: "absolute", right: 0, top: 40, zIndex: 40, minWidth: 320 }}>
                    {allReports.map((r) => {
                      const isCurrent = r.id === report.id;
                      return (
                        <Link
                          key={r.id}
                          href={`/reports/${r.id}?bp=${activeBp}`}
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
          </div>
        </div>

        {report.status === "cancelled" && (
          <div className="report__status-banner">
            <p className="report__status-banner-title">This report was cancelled by the user.</p>
          </div>
        )}
        {report.status === "failed" && (
          <div className="report__status-banner report__status-banner--error">
            <p className="report__status-banner-title report__status-banner-title--error">Report failed</p>
            {report.error && (
              <pre className="report__status-banner-detail">{report.error}</pre>
            )}
          </div>
        )}

        <VariantTabs
          variants={reportVariants}
          active={activeVariant}
          onChange={handleVariantChange}
        />

        <div className="report__breakpoints">
          <BreakpointTabs
            active={activeBp}
            onChange={handleBpChange}
            changeCounts={bpChangeCounts}
            breakpoints={reportBreakpoints}
            align="start"
          />
        </div>
      </div>

      <div className="report__grid-wrap">
        {(() => {
          const regularPages = report.pages.filter((p) => !p.flowId);
          const flowPages = report.pages.filter((p) => p.flowId);

          const flowGroups = new Map<string, ReportPage[]>();
          for (const fp of flowPages) {
            const group = flowGroups.get(fp.flowId!) || [];
            group.push(fp);
            flowGroups.set(fp.flowId!, group);
          }

          const renderPageCard = (page: ReportPage, index: number) => {
            const bpResult = getPageBp(page, String(activeBp));
            const changeCount = bpResult?.semanticChanges?.length ?? 0;
            const hasScreenshot = !!bpResult?.prodScreenshot;
            const diffSrc = bpResult?.diffScreenshot
              ? `/api/screenshots/${bpResult.diffScreenshot}`
              : null;

            return (
              <button
                key={page.id}
                onClick={(e) => openPage(page.pageId, e)}
                className="page-tile animate-card-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="page-tile__thumb page-tile__thumb--center">
                  {diffSrc ? (
                    <img
                      src={diffSrc}
                      alt={page.stepLabel || page.path}
                      className="page-tile__thumb-img page-tile__thumb-img--clamped"
                      style={{ maxWidth: activeBp }}
                    />
                  ) : (
                    <div className="page-tile__thumb-empty">No screenshot</div>
                  )}
                </div>
                <div className="page-tile__footer">
                  <span className="page-tile__label">
                    {page.stepLabel || page.path}
                  </span>
                  <ChangeBadge count={changeCount} noData={!hasScreenshot} />
                </div>
              </button>
            );
          };

          return (
            <>
              {regularPages.length > 0 && (
                <div className="page-grid">
                  {regularPages.map((page, i) => renderPageCard(page, i))}
                </div>
              )}

              {Array.from(flowGroups.entries()).map(([flowId, pages]) => {
                const flowName = pages[0]?.path.split(" > ")[0] || "Flow";
                return (
                  <div key={flowId} className="report__flow-section">
                    <div className="report__flow-header">
                      <span className="badge badge--flow">Flow</span>
                      <h3 className="report__flow-title">{flowName}</h3>
                    </div>
                    <div className="page-grid">
                      {pages.map((page, i) => renderPageCard(page, regularPages.length + i))}
                    </div>
                  </div>
                );
              })}
            </>
          );
        })()}

        {report.pages.length === 0 && report.status === "running" && (
          <div className="loader-centered">
            <div className="loader-spinner" />
            <p className="loader-text">Capturing screenshots...</p>
          </div>
        )}

        {report.pages.length === 0 && report.status === "failed" && (
          <p className="loader-text" style={{ textAlign: "center" }}>
            No pages were processed before the report failed.
          </p>
        )}

        {report.pages.length === 0 && report.status === "completed" && (
          <p className="loader-text" style={{ textAlign: "center" }}>
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
        <div style={{ padding: "var(--space-6)" }}>
          <p className="loader-text">Loading...</p>
        </div>
      }
    >
      <ReportPageInner />
    </Suspense>
  );
}
