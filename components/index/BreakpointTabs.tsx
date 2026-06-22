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
 * The report's breakpoint switcher — a TabBar whose tabs carry a solid change
 * dot when that breakpoint has any change, and nothing when it doesn't.
 */
export default function BreakpointTabs({ active, onChange, changeCounts, breakpoints: bpOverride, align = "center" }: Props) {
  const bps = bpOverride || [...BREAKPOINTS];
  const items = bps.map((bp) => {
    const stats = changeCounts?.[String(bp)];
    const hasChange =
      (stats?.changeCount ?? 0) > 0 ||
      (stats?.specificCount ?? 0) > 0 ||
      (stats?.universalCount ?? 0) > 0;
    return {
      id: bp,
      label: <span className="tab__label">{bp}px</span>,
      trailing: hasChange ? <span className="tab__deviation" /> : null,
    };
  });

  return <TabBar items={items} active={active} onSelect={onChange} align={align} />;
}
