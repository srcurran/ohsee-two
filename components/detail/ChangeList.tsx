"use client";

import { useMemo, useRef, useState } from "react";
import type { SemanticChange, ChangeCategory, ChangeSeverity } from "@/lib/types";
import { CATEGORY_CONFIG, SEVERITY_CSS_MODIFIERS } from "@/lib/colors";
import { topLevelSelector } from "@/lib/change-identity";
import type { ChangeScope } from "@/components/detail/utils/changeScope";

const SEVERITY_RANK: Record<ChangeSeverity, number> = { error: 0, warning: 1, info: 2 };

const OPAQUE_ID = /^#(?:w-node-|wf-|node-|el-|block-)[a-f0-9-]+$/i;

function isOpaqueSelector(sel: string): boolean {
  return OPAQUE_ID.test(sel) || /^div(:nth-of-type\(\d+\))?$/.test(sel);
}

function groupLabel(group: SelectorGroup): string {
  // Prefer the content-based location shared by the group's changes — set at
  // detection time from the DOM snapshot ("the header", "the “Pricing”
  // section"). The most common location across the group wins.
  const counts = new Map<string, number>();
  for (const c of group.changes) {
    if (c.location) counts.set(c.location, (counts.get(c.location) ?? 0) + 1);
  }
  if (counts.size > 0) {
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  // Fallback for older reports captured before `location` existed: a quoted
  // snippet, then a de-opaqued selector, then a tag/category summary.
  const tags = new Set(group.changes.map((c) => c.tag));
  const textChange = group.changes.find(
    (c) => c.category === "content" || (c.category === "structural" && c.description.includes('"')),
  );
  if (textChange) {
    const quoted = textChange.description.match(/"([^"]{1,30})"/);
    if (quoted) return `<${textChange.tag}> "${quoted[1]}"`;
  }
  const meaningful = group.selector
    .split(" > ")
    .filter((p) => !isOpaqueSelector(p.trim()));
  if (meaningful.length > 0) return meaningful.slice(-2).join(" > ");

  const categories = [...new Set(group.changes.map((c) => {
    const cfg = CATEGORY_CONFIG[c.category];
    return cfg?.label ?? c.category;
  }))];
  const tagList = [...tags].map((t) => `<${t}>`).join(", ");
  return `${tagList} — ${categories.join(", ")}`;
}

interface SelectorGroup {
  key: string;
  selector: string;
  severity: ChangeSeverity;
  changes: SemanticChange[];
}

/**
 * Bucket changes by top-level selector. Single-change buckets render flat
 * (no group chrome); multi-change buckets render as a parent card. Insertion
 * order is preserved so groups appear where their first change would have.
 */
function groupBySelector(changes: SemanticChange[]): SelectorGroup[] {
  const groups = new Map<string, SelectorGroup>();
  for (const change of changes) {
    const key = topLevelSelector(change.selector);
    const existing = groups.get(key);
    if (existing) {
      existing.changes.push(change);
      if (SEVERITY_RANK[change.severity] < SEVERITY_RANK[existing.severity]) {
        existing.severity = change.severity;
      }
    } else {
      groups.set(key, {
        key,
        selector: key,
        severity: change.severity,
        changes: [change],
      });
    }
  }
  return [...groups.values()];
}

interface ChangeListProps {
  changes: SemanticChange[];
  summary?: Record<string, number>;
  changeScope?: ChangeScope;
  onChangeClick?: (id: string) => void;
}

// How far the pointer must move before we treat the gesture as a drag and
// suppress the trailing click on whichever pill was under the cursor.
const DRAG_THRESHOLD_PX = 4;

export default function ChangeList({ changes, changeScope, onChangeClick }: ChangeListProps) {
  const [activeFilter, setActiveFilter] = useState<ChangeCategory | "all">("all");
  const filtersRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
    moved: boolean;
  } | null>(null);

  const allGroups = useMemo(() => groupBySelector(changes), [changes]);

  // Count by group (unique affected elements) rather than individual
  // property changes — "margin-left + margin-right + shift + resize" on
  // one element is 1 change, not 4.
  const { sortedCategories, categoryCounts, totalGroupCount } = useMemo(() => {
    const definedOrder = Object.keys(CATEGORY_CONFIG) as ChangeCategory[];
    const counts: Record<ChangeCategory, number> = {} as Record<ChangeCategory, number>;
    for (const cat of definedOrder) counts[cat] = 0;
    for (const group of allGroups) {
      const cats = new Set(group.changes.map((c) => c.category));
      for (const cat of cats) counts[cat] = (counts[cat] || 0) + 1;
    }
    const sorted = [...definedOrder].sort((a, b) => counts[b] - counts[a]);
    return { sortedCategories: sorted, categoryCounts: counts, totalGroupCount: allGroups.length };
  }, [allGroups]);

  const filtered = useMemo(
    () =>
      activeFilter === "all"
        ? changes
        : changes.filter((c) => c.category === activeFilter),
    [activeFilter, changes],
  );
  const groups = useMemo(() => groupBySelector(filtered), [filtered]);

  // Early return must follow every hook above so hook order stays stable
  // across renders (changes can go empty ⇄ non-empty).
  if (!changes || changes.length === 0) {
    return (
      <div className="change-notice">
        <span className="change-notice__icon">✓</span>
        <span>No visual regressions detected</span>
      </div>
    );
  }

  // Drag-to-scroll the pill row horizontally. We use Pointer Events but
  // intentionally do NOT call setPointerCapture on pointerdown — capturing
  // the pointer to the wrapper would re-target the synthesized click event
  // away from the inner pill buttons, breaking filter clicks. Capture is
  // only acquired once the gesture passes DRAG_THRESHOLD_PX (i.e., the
  // user is actually dragging), so simple clicks click as normal.
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Mouse: left button only. Touch/pen: always.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = filtersRef.current;
    if (!el) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragRef.current;
    const el = filtersRef.current;
    if (!ds || !el || ds.pointerId !== e.pointerId) return;
    const dx = e.clientX - ds.startX;
    if (!ds.moved && Math.abs(dx) >= DRAG_THRESHOLD_PX) {
      ds.moved = true;
      el.dataset.dragging = "true";
      // Now that we know it's a drag, capture the pointer so a fast drag
      // that leaves the strip's bounds keeps scrolling.
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    if (ds.moved) {
      el.scrollLeft = ds.startScroll - dx;
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragRef.current;
    const el = filtersRef.current;
    if (!ds || !el || ds.pointerId !== e.pointerId) return;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    // Defer clearing the flag until after the click event would have fired,
    // so the click capture handler below can swallow it.
    if (ds.moved) {
      requestAnimationFrame(() => {
        if (el) delete el.dataset.dragging;
      });
    }
    dragRef.current = null;
  };

  // Capture-phase click handler: if the user just finished a drag,
  // swallow the trailing click before it reaches a pill button.
  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = filtersRef.current;
    if (el?.dataset.dragging) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div className="change-list">
      <div className="change-list__header">
        <h3 className="change-list__title">Detected Changes</h3>
      </div>

      <div
        ref={filtersRef}
        className="change-list__filters change-list__filters--scroll"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={handleClickCapture}
      >
        <div className="change-list__filters-track">
          <button
            onClick={() => setActiveFilter("all")}
            className={`pill ${activeFilter === "all" ? "pill--active" : ""}`}
          >
            All ({totalGroupCount})
          </button>
          {sortedCategories.map((cat) => {
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
        {groups.map((group) =>
          group.changes.length === 1 ? (
            <ChangeEntry
              key={group.changes[0].id}
              change={group.changes[0]}
              changeScope={changeScope}
              onClick={onChangeClick ? () => onChangeClick(group.changes[0].id) : undefined}
            />
          ) : (
            <ChangeGroup
              key={group.key}
              group={group}
              changeScope={changeScope}
              onChangeClick={onChangeClick}
            />
          ),
        )}
      </div>
    </div>
  );
}

function ChangeGroup({
  group,
  changeScope,
  onChangeClick,
}: {
  group: SelectorGroup;
  changeScope?: ChangeScope;
  onChangeClick?: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const severityMod = SEVERITY_CSS_MODIFIERS[group.severity] || SEVERITY_CSS_MODIFIERS.info;
  return (
    <div className={`change-group change-group--${severityMod}${collapsed ? " change-group--collapsed" : ""}`}>
      <button
        className="change-group__header"
        onClick={() => setCollapsed((c) => !c)}
        type="button"
      >
        <span className={`change-group__chevron${collapsed ? "" : " change-group__chevron--open"}`}>
          ›
        </span>
        <span className="change-group__selector" title={group.selector}>
          {groupLabel(group)}
        </span>
        <span className="change-group__count">{group.changes.length}</span>
      </button>
      {!collapsed && (
        <div className="change-group__items">
          {group.changes.map((change) => (
            <ChangeEntry
              key={change.id}
              change={change}
              changeScope={changeScope}
              onClick={onChangeClick ? () => onChangeClick(change.id) : undefined}
              parentSelector={group.selector}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChangeEntry({
  change,
  changeScope,
  onClick,
  parentSelector,
}: {
  change: SemanticChange;
  changeScope?: ChangeScope;
  onClick?: () => void;
  /** When set, the entry is rendered inside a ChangeGroup whose header
   *  already names the location — we drop the visual chrome and the
   *  per-entry location line. */
  parentSelector?: string;
}) {
  const cfg = CATEGORY_CONFIG[change.category];
  const severityMod = SEVERITY_CSS_MODIFIERS[change.severity] || SEVERITY_CSS_MODIFIERS.info;
  const interactiveCls = onClick ? "change-entry--interactive" : "";
  const groupedCls = parentSelector ? "change-entry--grouped" : "";

  // Locate the change by content ("the header", "the “Pricing” section").
  // Inside a group the header already shows it, so only standalone entries
  // render their own location line.
  const locationLine = parentSelector ? undefined : change.location;

  // Scope badge — breakpoint-specific changes get a "N of M" annotation so
  // the user can distinguish universal changes from viewport-dependent ones.
  let scopeLabel: string | null = null;
  if (changeScope && changeScope.totalBps > 1) {
    const bpCount = changeScope.bpCountFor(change);
    if (bpCount < changeScope.totalBps) {
      scopeLabel = `${bpCount} of ${changeScope.totalBps}`;
    }
  }

  return (
    <div
      onClick={onClick}
      className={`change-entry change-entry--${severityMod} ${interactiveCls} ${groupedCls}`}
    >
      <span
        className="change-entry__icon"
        style={{ color: cfg.color }}
        title={cfg.label}
      >
        {cfg.icon}
      </span>
      <div className="change-entry__body">
        <span className="change-entry__description">
          {change.description}
          {scopeLabel && (
            <span className="change-entry__scope">{scopeLabel}</span>
          )}
        </span>
        {locationLine && (
          <span className="change-entry__selector">{locationLine}</span>
        )}
      </div>
    </div>
  );
}
