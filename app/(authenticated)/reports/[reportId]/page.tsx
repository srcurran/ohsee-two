"use client";

import { useEffect, useMemo, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import BreakpointTabs from "@/components/index/BreakpointTabs";
import VariantTabs from "@/components/index/VariantTabs";
import Segmented from "@/components/utility/Segmented";
import ErrorModal from "@/components/utility/ErrorModal";
import { LoadingOverlay } from "@/components/utility/LoadingOverlay";
import { useSidebar, usePageHeader } from "@/components/utility/SidebarProvider";
import PageDetailPanel from "@/components/detail/PageDetailPanel";
import { ReportHeader } from "@/components/index/ReportHeader";
import { ReportStatusBanner } from "@/components/index/ReportStatusBanner";
import { ReportPageGrid } from "@/components/index/ReportPageGrid";
import { useReportData } from "@/components/index/use/reportData";
import { useReportUrlState } from "@/components/index/use/reportUrlState";
import { markReportViewed } from "@/lib/viewed-reports";
import {
  computeBpChangeCounts,
  computeReportBreakpoints,
  computeReportVariants,
  getDomain,
  pickActiveBp,
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

  const reportVariants = useMemo(() => computeReportVariants(report), [report]);

  useEffect(() => {
    if (notFound) {
      localStorage.removeItem("ohsee-last-path");
      router.replace("/");
    }
  }, [notFound, router]);

  // Opening a completed report flips the sidebar dot from solid to
  // outlined. A run that's still capturing isn't yet "viewable" — wait
  // for the status to settle before marking, so a refresh-after-finish
  // flips the dot the moment there's something final to read.
  useEffect(() => {
    if (params.reportId && report && report.status !== "running") {
      markReportViewed(params.reportId);
    }
  }, [params.reportId, report]);

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

    const reportBreakpoints = computeReportBreakpoints(report);
    const activeBp = pickActiveBp(bpParam, reportBreakpoints);
    const bpChangeCounts = computeBpChangeCounts(report, activeVariant);

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
          />

          <ReportStatusBanner report={report} />

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
                <Segmented<typeof filterMode>
                  options={[
                    { value: "all", label: "Show all" },
                    { value: "changes", label: "Changes only" },
                  ]}
                  value={filterMode}
                  onChange={handleFilterChange}
                />
              </div>
            )}
          </div>
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
