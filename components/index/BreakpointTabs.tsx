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
          // Show a deviation dot when this breakpoint's changed-page count
          // differs from the active breakpoint — highlights breakpoint-
          // specific changes vs. universal ones.
          const deviates =
            !isActive &&
            stats !== undefined &&
            activeStats !== undefined &&
            stats.changed !== activeStats.changed;

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
