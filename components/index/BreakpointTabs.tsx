"use client";

import { BREAKPOINTS } from "@/lib/constants";

interface Props {
  active: number;
  onChange: (bp: number) => void;
  changeCounts?: Record<string, number>;
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
          const count = changeCounts?.[String(bp)];
          const hasData = count !== undefined;
          const hasChanges = hasData && count > 0;
          const noScreenshot = hasData && count < 0;

          return (
            <button
              key={bp}
              onClick={() => onChange(bp)}
              className={`tab ${isActive ? "tab--active" : ""}`}
            >
              {bp}px
              {hasData && (
                <span
                  className={`status-dot ${
                    noScreenshot ? "status-dot--disabled" : hasChanges ? "status-dot--warning" : "status-dot--success"
                  }`}
                />
              )}
              {isActive && <span className="tab__indicator" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
