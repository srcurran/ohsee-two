"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import BreakpointTabs from "@/components/index/BreakpointTabs";
import VariantTabs from "@/components/index/VariantTabs";
import TabBar from "@/components/utility/TabBar";
import ErrorModal from "@/components/utility/ErrorModal";
import { LoadingOverlay } from "@/components/utility/LoadingOverlay";
import { useSidebar, usePageHeader } from "@/components/utility/SidebarProvider";
import PageDetailPanel from "@/components/detail/PageDetailPanel";
import { ReportHeader } from "@/components/index/ReportHeader";
import { ReportStatusBanner } from "@/components/index/ReportStatusBanner";
import { ReportPageGrid } from "@/components/index/ReportPageGrid";
import { useReportData } from "@/components/index/use/reportData";
import { useReportUrlState } from "@/components/index/use/reportUrlState";
import { useReportModeShortcuts } from "@/components/index/use/reportModeShortcuts";
import { useAcceptedChanges, activeChanges } from "@/lib/accepted-changes";
import {
  computeBpChangeCounts,
  computeReportBreakpoints,
  computeReportVariants,
  getDomain,
  pickActiveBp,
  getPageBp,
} from "@/components/index/utils/report";

function ReportPageInner() {
  const params = useParams<{ reportId: string }>();
  const router = useRouter();
  const { refreshKey, refreshProjects, openProjectSettings, openTestSettings } = useSidebar();

  const {
    report,
    project,
    siteTest,
    allReports,
    notFound,
    runError,
    setRunError,
    runNow,
    cancel,
  } = useReportData({ reportId: params.reportId, refreshProjects, refreshKey });

  const {
    bpParam,
    activeVariant,
    activePageId,
    filterMode,
    pageOriginRect,
    pageOriginThumb,
    setPageOriginRect,
    setPageOriginThumb,
    handleBpChange,
    handleVariantChange,
    handleFilterChange,
    openPage,
    closePage,
  } = useReportUrlState();

  const { accepted } = useAcceptedChanges();

  const reportVariants = useMemo(() => computeReportVariants(report), [report]);
  const reportBreakpoints = useMemo(
    () => (report ? computeReportBreakpoints(report) : []),
    [report],
  );

  // Cmd/Ctrl + 1…8 select a breakpoint / variant (in report-bar order);
  // Cmd/Ctrl + 9 / 0 toggle All pages / Changes only. Routed through the URL
  // handlers so they drive both the grid and an open page-detail panel.
  useReportModeShortcuts({
    breakpoints: reportBreakpoints,
    variants: reportVariants,
    onBpChange: handleBpChange,
    onVariantChange: handleVariantChange,
    onFilterChange: handleFilterChange,
  });

  // Hold the "No changes" badge until the page's thumbnails have decoded, so
  // it animates in after the images instead of popping in with the title.
  // Preloads the visible thumbnails for the active view and latches true on
  // first completion (stays true across breakpoint switches).
  const [thumbsReady, setThumbsReady] = useState(false);
  useEffect(() => {
    if (!report) return;
    const bp = pickActiveBp(bpParam, reportBreakpoints);
    const srcs = report.pages
      .map((p) => {
        const r = getPageBp(p, String(bp), activeVariant);
        const s = r?.highlightScreenshot ?? r?.prodScreenshot;
        return s ? `/api/screenshots/${s}` : null;
      })
      .filter((s): s is string => !!s);
    if (srcs.length === 0) {
      setThumbsReady(true);
      return;
    }
    let cancelled = false;
    Promise.all(
      srcs.map((src) => {
        const img = new Image();
        img.src = src;
        return img.decode().catch(() => {});
      }),
    ).then(() => {
      if (!cancelled) setThumbsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [report, bpParam, reportBreakpoints, activeVariant]);

  // Cmd/Ctrl + Enter — run the current test now (ignored mid-run or while a
  // field is focused).
  const runningStatus = report?.status;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key !== "Enter") return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable ||
          el.closest?.(".cm-editor"))
      )
        return;
      if (runningStatus === "running") return;
      e.preventDefault();
      runNow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runningStatus, runNow]);

  useEffect(() => {
    if (notFound) {
      localStorage.removeItem("ohsee-last-path");
      router.replace("/");
    }
  }, [notFound, router]);

  // Push a custom titlebar header (project label, clickable to open
  // settings) into the 36px drag region. Memoized so the slot doesn't
  // reset on every render. Must be called unconditionally before any
  // early return.
  const projectLabel = project ? (project.name || getDomain(project.prodUrl)) : null;
  const pageHeaderNode = useMemo(() => {
    if (!project || !projectLabel) return null;
    return (
      <button
        onClick={() => openProjectSettings(project.id)}
        className="report__project-label report__project-label--button"
        title="Project settings"
      >
        {projectLabel}
      </button>
    );
  }, [project, projectLabel, openProjectSettings]);
  usePageHeader(pageHeaderNode);

  // Build the content tree only when both `report` and `project` are
  // ready. The LoadingOverlay sits as a sibling at the same JSX
  // position regardless of ready state so React keeps the same
  // instance across the transition — that's what lets it animate
  // its opacity from 1 → 0 and self-unmount after 300ms.
  let content: React.ReactNode = null;
  if (report && project) {
    const projectName = project.name || getDomain(project.prodUrl);
    // Title is the test name when present; legacy reports without a
    // siteTest fall back to the project name. Project label lives in
    // the titlebar slot.
    const headerTitle = siteTest?.name ?? projectName;
    // Both project-level and test-level reports now open overlays.
    // Legacy reports without a siteTestId open the project settings
    // overlay.
    const openSettings = () => {
      if (report.siteTestId) {
        openTestSettings(project.id, report.siteTestId);
      } else {
        openProjectSettings(project.id);
      }
    };

    const activeBp = pickActiveBp(bpParam, reportBreakpoints);
    const bpChangeCounts = computeBpChangeCounts(report, activeVariant, accepted);

    // Counts for the filter tabs: every page, vs pages with at least one
    // unaccepted change (the same rule ReportPageGrid uses to filter).
    const allPagesCount = report.pages.length;
    const changedPagesCount = report.pages.filter((page) => {
      const bpData =
        activeVariant && page.variants?.[activeVariant]
          ? page.variants[activeVariant]
          : page.breakpoints;
      return Object.values(bpData).some(
        (r) => activeChanges(r.semanticChanges ?? [], report.id, accepted).length > 0,
      );
    }).length;

    content = (
      <div className="report">
        <ErrorModal error={runError} onClose={() => setRunError(null)} />
        {activePageId && (
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
            filterMode={filterMode}
            onFilterChange={handleFilterChange}
          />
        )}

        <div className="report__sticky">
          <ReportHeader
            report={report}
            allReports={allReports}
            headerTitle={headerTitle}
            activeBp={activeBp}
            onRun={runNow}
            onCancel={cancel}
            onOpenSettings={openSettings}
            settingsTitle={report.siteTestId ? "Test settings" : "Project settings"}
            imagesReady={thumbsReady}
          />

          <ReportStatusBanner report={report} />

          {/* The bar (and its underline) only appears once a captured page
              gives us breakpoints — otherwise a fresh run shows a stray line
              under the title with no tabs beneath it. */}
          {reportBreakpoints.length > 0 && (
            <div className="report__bar">
              <div className="report__variants">
                <div className="report__breakpoints">
                  <BreakpointTabs
                    active={activeBp}
                    onChange={handleBpChange}
                    changeCounts={bpChangeCounts}
                    breakpoints={reportBreakpoints}
                    align="start"
                  />
                </div>
                {reportVariants.length > 0 && (
                  <div className="report__modes">
                    <VariantTabs
                      variants={reportVariants}
                      active={activeVariant}
                      onChange={handleVariantChange}
                    />
                  </div>
                )}
              </div>

              {report.status !== "running" && (
                <div className="report__filter">
                  <TabBar<typeof filterMode>
                    items={[
                      { id: "all", label: `All pages (${allPagesCount})` },
                      { id: "changes", label: `Changes only (${changedPagesCount})` },
                    ]}
                    active={filterMode}
                    onSelect={handleFilterChange}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`report__grid-wrap${report.status === "running" ? " report__grid-wrap--running" : ""}`}>
          <ReportPageGrid
            report={report}
            activeBp={activeBp}
            activeVariant={activeVariant}
            filterMode={filterMode}
            onOpenPage={openPage}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <LoadingOverlay ready={!!content} />
      {content}
    </>
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
