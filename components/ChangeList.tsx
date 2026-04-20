"use client";

import { useState } from "react";
import type { SemanticChange, ChangeCategory } from "@/lib/types";
import { CATEGORY_CONFIG, SEVERITY_CSS_MODIFIERS } from "@/lib/colors";

interface ChangeListProps {
  changes: SemanticChange[];
  summary?: Record<string, number>;
  onChangeClick?: (id: string) => void;
}

export default function ChangeList({ changes, summary, onChangeClick }: ChangeListProps) {
  const [activeFilter, setActiveFilter] = useState<ChangeCategory | "all">("all");

  if (!changes || changes.length === 0) {
    return (
      <div className="change-notice">
        <span className="change-notice__icon">✓</span>
        <span>No visual regressions detected</span>
      </div>
    );
  }

  // Every category is shown so the user sees the full detection surface;
  // counts of 0 render as disabled pills.
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
    <div className="change-list">
      <div className="change-list__header">
        <h3 className="change-list__title">Detected Changes</h3>
      </div>

      <div className="change-list__filters change-list__filters--scroll">
        <div className="change-list__filters-track">
          <button
            onClick={() => setActiveFilter("all")}
            className={`pill ${activeFilter === "all" ? "pill--active" : ""}`}
          >
            All ({changes.length})
          </button>
          {allCategories.map((cat) => {
            const cfg = CATEGORY_CONFIG[cat];
            const count = categoryCounts[cat];
            const enabled = count > 0;
            const active = activeFilter === cat;
            const cls = active
              ? "pill pill--active"
              : enabled
                ? "pill"
                : "pill pill--disabled";
            return (
              <button
                key={cat}
                onClick={() => enabled && setActiveFilter(cat)}
                disabled={!enabled}
                className={cls}
              >
                <span>{cfg.icon}</span>
                {cfg.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <div className="change-list__items">
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
  const severityMod = SEVERITY_CSS_MODIFIERS[change.severity] || SEVERITY_CSS_MODIFIERS.info;
  const interactiveCls = onClick ? "change-entry--interactive" : "";

  return (
    <div
      onClick={onClick}
      className={`change-entry change-entry--${severityMod} ${interactiveCls}`}
    >
      <span
        className="change-entry__icon"
        style={{ color: cfg.color }}
        title={cfg.label}
      >
        {cfg.icon}
      </span>
      <div className="change-entry__body">
        <span className="change-entry__description">{change.description}</span>
        {change.details.prodValue && change.details.devValue && (
          <span className="change-entry__selector">
            {readableSelector(change.selector)}
          </span>
        )}
      </div>
    </div>
  );
}

function readableSelector(sel: string): string {
  const parts = sel.split(" > ");
  const meaningful = parts
    .filter((p) => !p.match(/^div(:nth-of-type\(\d+\))?$/))
    .slice(-3);
  return meaningful.length > 0 ? meaningful.join(" > ") : parts.slice(-2).join(" > ");
}
