"use client";

import { useState } from "react";
import type { SemanticChange, ChangeCategory } from "@/lib/types";

const CATEGORY_CONFIG: Record<
  ChangeCategory,
  { label: string; icon: string; color: string }
> = {
  layout: { label: "Layout", icon: "⊞", color: "#c44" },
  spacing: { label: "Spacing", icon: "↔", color: "#c77" },
  alignment: { label: "Alignment", icon: "☰", color: "#a5c" },
  typography: { label: "Typography", icon: "Aa", color: "#77a" },
  color: { label: "Color", icon: "◉", color: "#5a7" },
  content: { label: "Content", icon: "✎", color: "#c44" },
  visibility: { label: "Visibility", icon: "◐", color: "#c44" },
  border: { label: "Border", icon: "─", color: "#a85" },
  structural: { label: "Structural", icon: "±", color: "#c44" },
};

const SEVERITY_STYLES: Record<string, string> = {
  error: "border-l-[#c44]",
  warning: "border-l-[#e1d034]",
  info: "border-l-[#aaa]",
};

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
        <span className="text-[16px] text-black/70">
          No visual regressions detected
        </span>
      </div>
    );
  }

  // Get active categories from the changes
  const categories = Object.entries(summary || {})
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a) as [ChangeCategory, number][];

  const filtered =
    activeFilter === "all"
      ? changes
      : changes.filter((c) => c.category === activeFilter);

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex items-center justify-between">
        <h3 className="text-[20px] font-bold text-black">
          Issues ({changes.length})
        </h3>
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-[8px]">
        <button
          onClick={() => setActiveFilter("all")}
          className={`rounded-full px-[12px] py-[4px] text-[13px] transition-colors ${
            activeFilter === "all"
              ? "bg-black text-white"
              : "bg-surface-tertiary text-black/70 hover:bg-black/10"
          }`}
        >
          All ({changes.length})
        </button>
        {categories.map(([cat, count]) => {
          const cfg = CATEGORY_CONFIG[cat];
          return (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat)}
              className={`rounded-full px-[12px] py-[4px] text-[13px] transition-colors ${
                activeFilter === cat
                  ? "bg-black text-white"
                  : "bg-surface-tertiary text-black/70 hover:bg-black/10"
              }`}
            >
              <span className="mr-[4px]">{cfg.icon}</span>
              {cfg.label} ({count})
            </button>
          );
        })}
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
  const severityBorder = SEVERITY_STYLES[change.severity] || SEVERITY_STYLES.info;

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
        <span className="text-[14px] text-black">{change.description}</span>
        {change.details.prodValue && change.details.devValue && (
          <span className="truncate text-[12px] text-black/40">
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
