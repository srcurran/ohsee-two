"use client";

import { Suspense, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import BreakpointTabs from "@/components/index/BreakpointTabs";
import VariantTabs from "@/components/index/VariantTabs";
import { ComparisonHeader, type ComparisonMode } from "@/components/detail/SliderComparison";
import { usePageTitle } from "@/components/utility/SidebarProvider";
import { LoadingOverlay } from "@/components/utility/LoadingOverlay";
import PageRouteHeader from "@/components/detail/PageRouteHeader";
import PageRouteCompareRow from "@/components/detail/PageRouteCompareRow";
import PageRouteIssues from "@/components/detail/PageRouteIssues";
import ScrollToTopButton from "@/components/detail/ScrollToTopButton";
import { usePageRouteData } from "@/components/detail/use/pageRouteData";
import { usePageRouteKeyboardNav } from "@/components/detail/use/pageRouteKeyboardNav";
import { getDomain } from "@/components/utility/utils/sidebar";
import {
  computeBpChangeCounts,
  getActiveBpData,
  getReportVariants,
} from "@/components/detail/utils/pageRoute";
import { countUniqueSemanticChanges } from "@/lib/change-identity";
import { useAcceptedChanges, activeChanges } from "@/lib/accepted-changes";

function PageDetailInner() {
  const params = useParams<{ reportId: string; pageId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { report, project, allReports } = usePageRouteData(params.reportId);
  const { accepted } = useAcceptedChanges();
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

  // Build the content tree only once `report` + `project` resolve.
  // LoadingOverlay sits in the same JSX position regardless so React
  // keeps the same instance across the loading → ready transition,
  // which is what lets it animate its opacity 1 → 0 and self-unmount.
  let content: React.ReactNode = null;
  if (report && project) {
    const currentIndex = report.pages.findIndex((p) => p.pageId === params.pageId);
    const currentPage = currentIndex >= 0 ? report.pages[currentIndex] : null;

    if (!currentPage) {
      content = (
        <div style={{ padding: "var(--space-6)" }}>
          <p className="loader-text">Page not found in report.</p>
        </div>
      );
    } else {
      const prevPage = currentIndex > 0 ? report.pages[currentIndex - 1] : null;
      const nextPage =
        currentIndex < report.pages.length - 1 ? report.pages[currentIndex + 1] : null;

      const activeBpData = getActiveBpData(currentPage, activeVariant);
      const bpResult = activeBpData[String(activeBp)];

      const displayUrl = project.name || getDomain(project.prodUrl);
      const totalUniqueChanges = countUniqueSemanticChanges(
        Object.values(activeBpData).map((bp) =>
          activeChanges(bp.semanticChanges, params.reportId, accepted),
        ),
      );
      // Accepted (expected) diffs are stripped so the deviation dots match
      // the (also accepted-filtered) header total.
      const bpChangeCounts = computeBpChangeCounts(
        Object.fromEntries(
          Object.entries(activeBpData).map(([bp, r]) => [
            bp,
            { ...r, semanticChanges: activeChanges(r.semanticChanges, params.reportId, accepted) },
          ]),
        ),
      );

      content = (
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
                breakpoints={project.breakpoints}
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

          <div className="report-page__body stack stack--lg">
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
                reportId={params.reportId}
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
  }

  return (
    <>
      <LoadingOverlay ready={!!content} />
      {content}
    </>
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
