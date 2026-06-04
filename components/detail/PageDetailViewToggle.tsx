/** Sticky view toggle above the screenshot column: Prod label / Tap-Slider
 * segmented / Dev label, plus a Diff button at the row end. Prod and Dev
 * force the Tap view and lock the side; Diff swaps the plain screenshots for
 * their change-highlighted variants. */

"use client";

import type { ViewMode } from "@/components/detail/use/pageDetailViewMode";

interface PageDetailViewToggleProps {
  viewMode: ViewMode;
  showingDev: boolean;
  diffMode: boolean;
  changeViewMode: (next: ViewMode) => void;
  setForceDevLocked: (v: boolean) => void;
  setShowingDev: (v: boolean) => void;
  setDiffMode: React.Dispatch<React.SetStateAction<boolean>>;
}

export function PageDetailViewToggle({
  viewMode,
  showingDev,
  diffMode,
  changeViewMode,
  setForceDevLocked,
  setShowingDev,
  setDiffMode,
}: PageDetailViewToggleProps) {
  return (
    <div className="page-detail-panel__view-toggle page-detail-panel__view-toggle--sticky">
      <div className="page-detail-panel__view-toggle-group">
      <button
        onClick={() => {
          changeViewMode("tap");
          setForceDevLocked(false);
          setShowingDev(false);
        }}
        className={`page-detail-panel__view-label ${
          viewMode === "tap" && !showingDev
            ? "page-detail-panel__view-label--active"
            : ""
        }`}
      >
        Prod
      </button>
      <div className="segmented segmented--content-bg">
        {(["tap", "blend", "slider"] as const).map((m) => {
          const label = m === "tap" ? "Tap" : m === "blend" ? "Blend" : "Slider";
          const active = viewMode === m;
          return (
            <button
              key={m}
              onClick={() => changeViewMode(m)}
              className={`segmented__item ${active ? "segmented__item--active-alt" : ""}`}
            >
              <span className="view-toggle-label">
                <span
                  className={
                    active
                      ? "view-toggle-label__bold"
                      : "view-toggle-label__regular"
                  }
                >
                  {label}
                </span>
                <span aria-hidden className="view-toggle-label__ghost">
                  {label}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <button
        onClick={() => {
          changeViewMode("tap");
          setForceDevLocked(true);
          setShowingDev(true);
        }}
        className={`page-detail-panel__view-label page-detail-panel__view-label--right ${
          viewMode === "tap" && showingDev
            ? "page-detail-panel__view-label--active"
            : ""
        }`}
      >
        Dev
      </button>
      </div>
      <button
        onClick={() => setDiffMode((v) => !v)}
        className={`page-detail-panel__diff-toggle ${
          diffMode ? "page-detail-panel__diff-toggle--active" : ""
        }`}
        aria-pressed={diffMode}
      >
        Diff
      </button>
    </div>
  );
}
