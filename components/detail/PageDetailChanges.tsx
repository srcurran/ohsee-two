/** Right-hand changes pane for the PageDetailPanel: renders the ChangeList
 * when there are semantic changes anywhere across the page's breakpoints,
 * the "no structural changes" entry when only pixel diffs were found at
 * the active breakpoint, and the "no differences" entry otherwise. */

"use client";

import ChangeList from "@/components/detail/ChangeList";
import type { SemanticChange } from "@/lib/types";
import type { ChangeScope } from "@/components/detail/utils/changeScope";

interface PageDetailChangesProps {
  /** Cross-breakpoint changes for the page, deduped to one entry per
   *  logical change. ChangeList dims those that don't apply to the
   *  current viewport. */
  changes: SemanticChange[];
  /** Active breakpoint — used by ChangeList to decide which entries to dim. */
  activeBp: number;
  /** Whether the active breakpoint has any pixel diff (drives the empty-
   *  state message when there are zero semantic changes anywhere). */
  hasPixelDiff: boolean;
  changeScope?: ChangeScope;
  onChangeClick: (id: string) => void;
}

export function PageDetailChanges({
  changes,
  activeBp,
  hasPixelDiff,
  changeScope,
  onChangeClick,
}: PageDetailChangesProps) {
  return (
    <div className="page-detail-panel__changes">
      {changes.length > 0 ? (
        <ChangeList
          changes={changes}
          activeBp={activeBp}
          changeScope={changeScope}
          onChangeClick={onChangeClick}
        />
      ) : hasPixelDiff ? (
        <div className="change-entry change-entry--ok">
          <span className="change-entry__icon">✓</span>
          <div className="change-entry__body stack stack--sm">
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
          <div className="change-entry__body stack stack--sm">
            <span className="change-entry__description">
              No differences between versions
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
