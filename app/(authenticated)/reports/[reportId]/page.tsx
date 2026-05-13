"use client";

import { useEffect, useMemo, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import BreakpointTabs from "@/components/BreakpointTabs";
import VariantTabs from "@/components/VariantTabs";
import ErrorModal from "@/components/ErrorModal";
import { useSidebar, usePageHeader } from "@/components/SidebarProvider";
import PageDetailPanel from "@/components/PageDetailPanel";
import { ReportHeader } from "@/components/ReportHeader";
import { ReportStatusBanner } from "@/components/ReportStatusBanner";
import { ReportPageGrid } from "@/components/ReportPageGrid";
import { ProjectMenuIcon } from "@/components/icons";
import { useReportData } from "@/components/use/reportData";
import { useReportUrlState } from "@/components/use/reportUrlState";
import {
  computeBpChangeCounts,
  computeReportBreakpoints,
  computeReportVariants,
  getDomain,
  pickActiveBp,
} from "@/components/utils/report";

function ReportPageInner() {
  const params = useParams<{ reportId: string }>();
  const router = useRouter();
  const { refreshProjects, openProjectSettings, openTestSettings } = useSidebar();

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
  } = useReportData({ reportId: params.reportId, refreshProjects });

  const {
    bpParam,
    activeVariant,
    activePageId,
    pageOriginRect,
    pageOriginThumb,
    setPageOriginRect,
    setPageOriginThumb,
    handleBpChange,
    handleVariantChange,
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

  // Push a custom titlebar header (project eyebrow + project-settings icon)
  // into the 36px drag region. Memoized so the slot doesn't reset on every
  // render. Must be called unconditionally before any early return.
  const projectLabel = project ? (project.name || getDomain(project.prodUrl)) : null;
  const pageHeaderNode = useMemo(() => {
    if (!project || !projectLabel) return null;
    return (
      <>
        <span className="report__project-label">{projectLabel}</span>
        <button
          onClick={() => openProjectSettings(project.id)}
          className="icon-btn icon-btn--sm"
          title="Project settings"
        >
          <ProjectMenuIcon />
        </button>
      </>
    );
  }, [project, projectLabel, openProjectSettings]);
  usePageHeader(pageHeaderNode);

  if (!report) {
    return (
      <div style={{ padding: "var(--space-6)" }}>
        <p className="loader-text">{notFound ? "Redirecting..." : "Loading..."}</p>
      </div>
    );
  }

  const projectName = project ? (project.name || getDomain(project.prodUrl)) : "...";
  // Title is the test name when present; legacy reports without a siteTest
  // fall back to the project name. Project label lives in the titlebar slot.
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

  const reportBreakpoints = computeReportBreakpoints(report);
  const activeBp = pickActiveBp(bpParam, reportBreakpoints);
  const bpChangeCounts = computeBpChangeCounts(report, activeVariant);

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
        <ReportHeader
          report={report}
          allReports={allReports}
          headerTitle={headerTitle}
          activeBp={activeBp}
          onRun={runNow}
          onCancel={cancel}
          onOpenSettings={openSettings}
          settingsTitle={report?.siteTestId ? "Test settings" : "Project settings"}
        />

        <ReportStatusBanner report={report} />

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
        <ReportPageGrid
          report={report}
          activeBp={activeBp}
          activeVariant={activeVariant}
          onOpenPage={openPage}
        />
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
