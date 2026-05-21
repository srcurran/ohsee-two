"use client";

import { BREAKPOINTS } from "@/lib/constants";
import type { BpChangeStats } from "@/components/index/utils/report";

interface Props {
  active: number;
  onChange: (bp: number) => void;
  changeCounts?: Record<string, BpChangeStats>;
  breakpoints?: number[];
  align?: "center" | "start";
}

export default function BreakpointTabs({ active, onChange, changeCounts, breakpoints: bpOverride, align = "center" }: Props) {
  const bps = bpOverride || [...BREAKPOINTS];
  const activeStats = changeCounts?.[String(active)];
  return (
    <div className="tab-bar">
      <div className={`tab-bar__list tab-bar__list--${align}`}>
        {bps.map((bp) => {
          const isActive = active === bp;
          const stats = changeCounts?.[String(bp)];
          // When scope-aware specific counts are available (detail panel),
          // show type-based dots: outline = universal, filled = specific.
          // Falls back to a single filled dot for the report overview
          // (deviation comparison against the active breakpoint).
          const hasScope = stats?.specificCount !== undefined;
          const specificCount = stats?.specificCount ?? 0;
          const universalCount = hasScope
            ? (stats?.changeCount ?? 0) - specificCount
            : 0;

          // Detail panel: show dots per change type on non-active bps
          const showUniversalDot = !isActive && hasScope && universalCount > 0;
          const showSpecificDot = !isActive && hasScope && specificCount > 0;

          // Report overview fallback: single dot when counts deviate
          const deviates =
            !isActive &&
            !hasScope &&
            stats !== undefined &&
            activeStats !== undefined &&
            (stats.changed !== activeStats.changed ||
             stats.changeCount !== activeStats.changeCount);

          return (
            <button
              key={bp}
              onClick={() => onChange(bp)}
              className={`tab ${isActive ? "tab--active" : ""}`}
            >
              <span className="tab__label">{bp}px</span>
              {showUniversalDot && <span className="tab__deviation tab__deviation--outline" />}
              {(showSpecificDot || deviates) && <span className="tab__deviation" />}
              {isActive && <span className="tab__indicator" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
