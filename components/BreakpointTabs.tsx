"use client";

import { BREAKPOINTS } from "@/lib/constants";

interface Props {
  active: number;
  onChange: (bp: number) => void;
  changeCounts?: Record<string, number>;
}

export default function BreakpointTabs({ active, onChange, changeCounts }: Props) {
  return (
    <div className="border-b border-border-secondary">
      <div className="flex items-center justify-center gap-[24px]">
        {BREAKPOINTS.map((bp) => {
          const isActive = active === bp;
          const count = changeCounts?.[String(bp)];
          const hasData = count !== undefined;
          const hasChanges = hasData && count > 0;

          return (
            <button
              key={bp}
              onClick={() => onChange(bp)}
              className={`relative flex items-center gap-[4px] py-[12px] text-[14px] text-foreground ${
                isActive ? "font-bold" : "font-normal"
              }`}
            >
              {bp}px
              {hasData && (
                <span
                  className={`inline-block h-[8px] w-[8px] rounded-full ${
                    hasChanges ? "bg-accent-yellow" : "bg-accent-green"
                  }`}
                />
              )}
              {/* Active underline indicator */}
              {isActive && (
                <span className="absolute bottom-[-1px] left-0 right-0 h-[4px] bg-foreground" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
