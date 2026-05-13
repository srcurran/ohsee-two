/** Sticky tri-state view toggle above the screenshot column: Prod label /
 * Changes-Tap-Slider segmented / Dev label. Switching to Prod or Dev forces
 * the underlying Tap view and locks the slider side accordingly. */

"use client";

import type { ViewMode } from "@/components/detail/use/pageDetailViewMode";

interface PageDetailViewToggleProps {
  viewMode: ViewMode;
  showingDev: boolean;
  changeViewMode: (next: ViewMode) => void;
  setForceDevLocked: (v: boolean) => void;
  setShowingDev: (v: boolean) => void;
}

export function PageDetailViewToggle({
  viewMode,
  showingDev,
  changeViewMode,
  setForceDevLocked,
  setShowingDev,
}: PageDetailViewToggleProps) {
  return (
    <div className="page-detail-panel__view-toggle page-detail-panel__view-toggle--sticky">
      <button
        onClick={() => {
          changeViewMode("tap");
          setForceDevLocked(false);
          setShowingDev(false);
        }}
        className={`page-detail-panel__view-label ${
          (viewMode === "tap" && !showingDev) || viewMode === "changes"
            ? "page-detail-panel__view-label--active"
            : ""
        }`}
      >
        Prod
      </button>
      <div className="segmented segmented--content-bg">
        {(["changes", "tap", "slider"] as const).map((m) => {
          const label = m === "tap" ? "Tap" : m === "slider" ? "Slider" : "Changes";
          const active = viewMode === m;
          return (
            <button
              key={m}
              onClick={() => {
                changeViewMode(m);
                if (m !== "tap") {
                  setForceDevLocked(false);
                  setShowingDev(false);
                }
              }}
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
  );
}
