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
          // Show a deviation dot when this breakpoint's change profile
          // differs from the active breakpoint. When scope-aware specific
          // counts are available (detail panel), prefer those — they ignore
          // universal changes and only flag viewport-dependent deviations.
          // Falls back to total changeCount comparison (report overview).
          const hasScope = stats?.specificCount !== undefined;
          const deviates =
            !isActive &&
            stats !== undefined &&
            activeStats !== undefined &&
            (hasScope
              ? (stats.specificCount ?? 0) !== (activeStats.specificCount ?? 0)
              : (stats.changed !== activeStats.changed ||
                 stats.changeCount !== activeStats.changeCount));

          return (
            <button
              key={bp}
              onClick={() => onChange(bp)}
              className={`tab ${isActive ? "tab--active" : ""}`}
            >
              <span className="tab__label">{bp}px</span>
              {deviates && <span className="tab__deviation" />}
              {isActive && <span className="tab__indicator" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
