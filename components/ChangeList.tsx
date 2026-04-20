"use client";

import { useState } from "react";
import type { SemanticChange, ChangeCategory } from "@/lib/types";
import { CATEGORY_CONFIG, SEVERITY_BORDER_CLASSES } from "@/lib/colors";

interface ChangeListProps {
  changes: SemanticChange[];
  summary?: Record<string, number>;
  onChangeClick?: (id: string) => void;
}

export default function ChangeList({ changes, summary, onChangeClick }: ChangeListProps) {
  const [activeFilter, setActiveFilter] = useState<ChangeCategory | "all">(
    "all"
  );

  if (!changes || changes.length === 0) {
    return (
      <div className="flex items-center gap-[8px] rounded-[8px] bg-accent-green/20 px-[20px] py-[16px]">
        <span className="text-[20px]">✓</span>
        <span className="text-[16px] text-text-secondary">
          No visual regressions detected
        </span>
      </div>
    );
  }

  // Every category is shown so the user sees the full detection surface;
  // counts of 0 render as disabled pills. Order follows CATEGORY_CONFIG
  // for stability across reports.
  const allCategories = Object.keys(CATEGORY_CONFIG) as ChangeCategory[];
  const categoryCounts: Record<ChangeCategory, number> = {} as Record<ChangeCategory, number>;
  for (const cat of allCategories) {
    categoryCounts[cat] = summary?.[cat] ?? 0;
  }

  const filtered =
    activeFilter === "all"
      ? changes
      : changes.filter((c) => c.category === activeFilter);

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex items-center justify-between">
        <h3 className="text-[20px] font-bold text-foreground">
          Detected Changes
        </h3>
      </div>

      {/* Category filter pills — scroll horizontally so all categories stay on
          one row. `-mx/px` lets the scroll bleed past the panel padding. */}
      <div className="-mx-[24px] overflow-x-auto px-[24px] pb-[4px] [scrollbar-width:thin]">
        <div className="flex w-max items-center gap-[8px]">
          <button
            onClick={() => setActiveFilter("all")}
            className={`shrink-0 whitespace-nowrap rounded-full px-[12px] py-[4px] text-[13px] transition-colors ${
              activeFilter === "all"
                ? "bg-foreground text-surface-content"
                : "bg-surface-tertiary text-text-secondary hover:bg-foreground/10"
            }`}
          >
            All ({changes.length})
          </button>
          {allCategories.map((cat) => {
            const cfg = CATEGORY_CONFIG[cat];
            const count = categoryCounts[cat];
            const enabled = count > 0;
            const active = activeFilter === cat;
            return (
              <button
                key={cat}
                onClick={() => enabled && setActiveFilter(cat)}
                disabled={!enabled}
                className={`shrink-0 whitespace-nowrap rounded-full px-[12px] py-[4px] text-[13px] transition-colors ${
                  active
                    ? "bg-foreground text-surface-content"
                    : enabled
                      ? "bg-surface-tertiary text-text-secondary hover:bg-foreground/10"
                      : "bg-surface-tertiary/50 text-text-subtle/60 cursor-not-allowed"
                }`}
              >
                <span className="mr-[4px]">{cfg.icon}</span>
                {cfg.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Change entries */}
      <div className="flex flex-col gap-[4px]">
        {filtered.map((change) => (
          <ChangeEntry
            key={change.id}
            change={change}
            onClick={onChangeClick ? () => onChangeClick(change.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function ChangeEntry({ change, onClick }: { change: SemanticChange; onClick?: () => void }) {
  const cfg = CATEGORY_CONFIG[change.category];
  const severityBorder = SEVERITY_BORDER_CLASSES[change.severity] || SEVERITY_BORDER_CLASSES.info;

  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-[12px] border-l-[3px] ${severityBorder} bg-surface-tertiary py-[10px] pl-[12px] pr-[16px] ${
        onClick ? "cursor-pointer hover:bg-surface-tertiary/80" : ""
      }`}
    >
      <span
        className="mt-[2px] flex h-[20px] w-[20px] flex-shrink-0 items-center justify-center text-[13px]"
        style={{ color: cfg.color }}
        title={cfg.label}
      >
        {cfg.icon}
      </span>
      <div className="flex min-w-0 flex-col gap-[2px]">
        <span className="text-[14px] text-foreground">{change.description}</span>
        {change.details.prodValue && change.details.devValue && (
          <span className="truncate text-[12px] text-text-subtle">
            {readableSelector(change.selector)}
          </span>
        )}
      </div>
    </div>
  );
}

function readableSelector(sel: string): string {
  const parts = sel.split(" > ");
  // Show last 3 meaningful parts
  const meaningful = parts
    .filter((p) => !p.match(/^div(:nth-of-type\(\d+\))?$/))
    .slice(-3);
  return meaningful.length > 0 ? meaningful.join(" > ") : parts.slice(-2).join(" > ");
}
