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
          // differs from the active breakpoint — either a different number
          // of pages with changes, or a different total change count
          // (catches e.g. 3 changes at 1440 vs 2 at 1024 on the same page).
          const deviates =
            !isActive &&
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
              {deviates && <span className="tab__deviation" />}
              {isActive && <span className="tab__indicator" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
