"use client";

import { Suspense, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import BreakpointTabs from "@/components/BreakpointTabs";
import VariantTabs from "@/components/VariantTabs";
import { ComparisonHeader, type ComparisonMode } from "@/components/SliderComparison";
import { usePageTitle } from "@/components/SidebarProvider";
import PageRouteHeader from "@/components/PageRouteHeader";
import PageRouteCompareRow from "@/components/PageRouteCompareRow";
import PageRouteIssues from "@/components/PageRouteIssues";
import ScrollToTopButton from "@/components/ScrollToTopButton";
import { usePageRouteData } from "@/components/use/pageRouteData";
import { usePageRouteKeyboardNav } from "@/components/use/pageRouteKeyboardNav";
import { getDomain } from "@/components/utils/sidebar";
import {
  computeBpChangeCounts,
  getActiveBpData,
  getReportVariants,
} from "@/components/utils/pageRoute";
import { countUniqueSemanticChanges } from "@/lib/change-identity";

function PageDetailInner() {
  const params = useParams<{ reportId: string; pageId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { report, project, allReports } = usePageRouteData(params.reportId);
  const [highlightedChangeId, setHighlightedChangeId] = useState<string | null>(null);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("tap");
  const [showingDev, setShowingDev] = useState(false);
  const activeBp = Number(searchParams.get("bp")) || 1024;
  const activeVariant = searchParams.get("variant") || null;

  usePageTitle(project ? project.name || getDomain(project.prodUrl) : null);
  usePageRouteKeyboardNav(report, params.pageId, activeBp);

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

  const reportVariants = useMemo(
    () => (report ? getReportVariants(report) : []),
    [report],
  );

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
  const nextPage =
    currentIndex < report.pages.length - 1 ? report.pages[currentIndex + 1] : null;

  const activeBpData = getActiveBpData(currentPage, activeVariant);
  const bpResult = activeBpData[String(activeBp)];

  const displayUrl = project ? project.name || getDomain(project.prodUrl) : "...";
  const totalUniqueChanges = countUniqueSemanticChanges(
    Object.values(activeBpData).map((bp) => bp.semanticChanges),
  );
  const bpChangeCounts = computeBpChangeCounts(activeBpData);

  return (
    <div className="report-page">
      <div className="report-page__sticky">
        <PageRouteHeader
          report={report}
          allReports={allReports}
          currentPage={currentPage}
          pageId={params.pageId}
          prevPage={prevPage}
          nextPage={nextPage}
          displayUrl={displayUrl}
          totalUniqueChanges={totalUniqueChanges}
          activeBp={activeBp}
        />

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
              <ComparisonHeader
                mode={comparisonMode}
                onModeChange={setComparisonMode}
                showingDev={showingDev}
              />
            </div>
          </div>
        )}
      </div>

      <div className="report-page__body">
        {bpResult ? (
          <PageRouteCompareRow
            bpResult={bpResult}
            alt={`Diff for ${currentPage.path}`}
            highlightedChangeId={highlightedChangeId}
            comparisonMode={comparisonMode}
            onComparisonModeChange={setComparisonMode}
            onShowingDevChange={setShowingDev}
          />
        ) : (
          <p className="loader-text" style={{ textAlign: "center" }}>
            No screenshot available for this breakpoint.
          </p>
        )}

        {bpResult?.semanticChanges && bpResult.semanticChanges.length > 0 && (
          <PageRouteIssues
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
