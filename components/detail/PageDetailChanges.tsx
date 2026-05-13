/** Right-hand changes pane for the PageDetailPanel: renders the ChangeList
 * when there are semantic changes, the "no structural changes" entry when
 * only pixel diffs were found, and the "no differences" entry otherwise. */

"use client";

import ChangeList from "@/components/detail/ChangeList";
import type { BreakpointResult } from "@/lib/types";

interface PageDetailChangesProps {
  bpResult: BreakpointResult;
  onChangeClick: (id: string) => void;
}

export function PageDetailChanges({
  bpResult,
  onChangeClick,
}: PageDetailChangesProps) {
  return (
    <div className="page-detail-panel__changes">
      {bpResult.semanticChanges && bpResult.semanticChanges.length > 0 ? (
        <ChangeList
          changes={bpResult.semanticChanges}
          summary={bpResult.changeSummary}
          onChangeClick={onChangeClick}
        />
      ) : bpResult.pixelChangeCount && bpResult.pixelChangeCount > 0 ? (
        <div className="change-entry change-entry--ok">
          <span className="change-entry__icon">✓</span>
          <div className="change-entry__body">
            <span className="change-entry__description">
              No structural changes
            </span>
            <span className="change-entry__selector">
              Some pixel differences detected
            </span>
          </div>
        </div>
      ) : (
        <div className="change-entry change-entry--ok">
          <span className="change-entry__icon">✓</span>
          <div className="change-entry__body">
            <span className="change-entry__description">
              No differences between versions
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
