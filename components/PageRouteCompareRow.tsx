"use client";

import DiffViewer from "@/components/DiffViewer";
import SliderComparison, { type ComparisonMode } from "@/components/SliderComparison";
import type { BreakpointResult } from "@/lib/types";

interface PageRouteCompareRowProps {
  bpResult: BreakpointResult;
  alt: string;
  highlightedChangeId: string | null;
  comparisonMode: ComparisonMode;
  onComparisonModeChange: (mode: ComparisonMode) => void;
  onShowingDevChange: (showingDev: boolean) => void;
}

/** Side-by-side compare layout for one breakpoint: DiffViewer (highlight-aware)
 * on the left, SliderComparison on the right. The slider's own header is
 * hidden because the sticky page header renders the shared `ComparisonHeader`
 * above this row. */
export default function PageRouteCompareRow({
  bpResult,
  alt,
  highlightedChangeId,
  comparisonMode,
  onComparisonModeChange,
  onShowingDevChange,
}: PageRouteCompareRowProps) {
  const prodSrc = `/api/screenshots/${bpResult.alignedProdScreenshot ?? bpResult.prodScreenshot}`;
  const devSrc = `/api/screenshots/${bpResult.alignedDevScreenshot ?? bpResult.devScreenshot}`;

  return (
    <div className="report-page__compare-row">
      <div className="report-page__compare-col">
        <DiffViewer
          prodSrc={prodSrc}
          devSrc={devSrc}
          alt={alt}
          changes={bpResult.semanticChanges}
          highlightedChangeId={highlightedChangeId}
        />
      </div>
      <div className="report-page__compare-col">
        <SliderComparison
          prodSrc={prodSrc}
          devSrc={devSrc}
          mode={comparisonMode}
          onModeChange={onComparisonModeChange}
          onPressedChange={onShowingDevChange}
          hideHeader
        />
      </div>
    </div>
  );
}
