"use client";

import { BREAKPOINTS } from "@/lib/constants";
import type { BpChangeStats } from "@/components/index/utils/report";
import TabBar from "@/components/utility/TabBar";

interface Props {
  active: number;
  onChange: (bp: number) => void;
  changeCounts?: Record<string, BpChangeStats>;
  breakpoints?: number[];
  align?: "center" | "start";
}

/**
 * The report's breakpoint switcher — a TabBar whose tabs carry a change dot:
 * filled when at least one change here is viewport-specific (the signal worth
 * shouting about), outline when changes exist but fire at every breakpoint,
 * none when there are no changes.
 */
export default function BreakpointTabs({ active, onChange, changeCounts, breakpoints: bpOverride, align = "center" }: Props) {
  const bps = bpOverride || [...BREAKPOINTS];
  const items = bps.map((bp) => {
    const stats = changeCounts?.[String(bp)];
    const specific = stats?.specificCount ?? 0;
    const universal = stats?.universalCount ?? 0;
    const hasAnyChange = (stats?.changeCount ?? 0) > 0;
    const dotMod = specific > 0 ? "filled" : universal > 0 || hasAnyChange ? "outline" : null;
    return {
      id: bp,
      label: <span className="tab__label">{bp}px</span>,
      trailing:
        dotMod === "outline" ? (
          <span className="tab__deviation tab__deviation--outline" />
        ) : dotMod === "filled" ? (
          <span className="tab__deviation" />
        ) : null,
    };
  });

  return <TabBar items={items} active={active} onSelect={onChange} align={align} />;
}
