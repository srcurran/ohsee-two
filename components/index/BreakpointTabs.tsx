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
  return (
    <div className="tab-bar">
      <div className={`tab-bar__list tab-bar__list--${align}`}>
        {bps.map((bp) => {
          const isActive = active === bp;
          const stats = changeCounts?.[String(bp)];
          // One dot per tab. A filled dot means at least one change at this
          // breakpoint is *viewport-specific* — i.e. unique to a subset of
          // breakpoints — and is the signal worth shouting about. An outline
          // dot means there are changes here but they all also fire at every
          // other breakpoint, so the indicator is muted. No dot if there are
          // no changes at this breakpoint.
          const specific = stats?.specificCount ?? 0;
          const universal = stats?.universalCount ?? 0;
          const hasAnyChange = (stats?.changeCount ?? 0) > 0;
          const dotMod =
            specific > 0
              ? "filled"
              : universal > 0 || hasAnyChange
                ? "outline"
                : null;

          return (
            <button
              key={bp}
              onClick={() => onChange(bp)}
              className={`tab ${isActive ? "tab--active" : ""}`}
            >
              <span className="tab__label">{bp}px</span>
              {dotMod === "outline" && (
                <span className="tab__deviation tab__deviation--outline" />
              )}
              {dotMod === "filled" && <span className="tab__deviation" />}
              {isActive && <span className="tab__indicator" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
