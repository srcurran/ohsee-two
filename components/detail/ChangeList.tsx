"use client";

import { useMemo, useRef, useState } from "react";
import type { SemanticChange, ChangeCategory } from "@/lib/types";
import { CATEGORY_CONFIG, SEVERITY_CSS_MODIFIERS } from "@/lib/colors";
import type { ChangeScope } from "@/components/detail/utils/changeScope";

interface ChangeListProps {
  changes: SemanticChange[];
  summary?: Record<string, number>;
  /** When set, entries whose change doesn't apply to this breakpoint render
   *  dimmed and non-interactive — same affordance as a filter pill with a
   *  zero count, applied per entry. */
  activeBp?: number;
  changeScope?: ChangeScope;
  onChangeClick?: (id: string) => void;
}

// How far the pointer must move before we treat the gesture as a drag and
// suppress the trailing click on whichever pill was under the cursor.
const DRAG_THRESHOLD_PX = 4;

export default function ChangeList({ changes, activeBp, changeScope, onChangeClick }: ChangeListProps) {
  const [activeFilter, setActiveFilter] = useState<ChangeCategory | "all">("all");
  const filtersRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
    moved: boolean;
  } | null>(null);

  // Count each detected change individually. Noise reduction in the
  // detection pipeline means changes are already de-duplicated to one
  // entry per real edit, so there's nothing left to group.
  const { sortedCategories, categoryCounts, totalCount } = useMemo(() => {
    const definedOrder = Object.keys(CATEGORY_CONFIG) as ChangeCategory[];
    const counts: Record<ChangeCategory, number> = {} as Record<ChangeCategory, number>;
    for (const cat of definedOrder) counts[cat] = 0;
    for (const change of changes) {
      counts[change.category] = (counts[change.category] || 0) + 1;
    }
    const sorted = [...definedOrder].sort((a, b) => counts[b] - counts[a]);
    return { sortedCategories: sorted, categoryCounts: counts, totalCount: changes.length };
  }, [changes]);

  const filtered = useMemo(
    () =>
      activeFilter === "all"
        ? changes
        : changes.filter((c) => c.category === activeFilter),
    [activeFilter, changes],
  );

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
            All ({totalCount})
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
        {filtered.map((change) => {
          // A change is "for this viewport" if its scope (the set of
          // breakpoints it appears at) includes the active one. Anything
          // else renders dimmed and non-interactive — same idea as a
          // filter pill with a zero count, applied per entry.
          const dimmed =
            activeBp !== undefined &&
            changeScope?.bpsFor(change).includes(String(activeBp)) === false;
          return (
            <ChangeEntry
              key={change.id}
              change={change}
              changeScope={changeScope}
              dimmed={dimmed}
              onClick={
                onChangeClick && !dimmed
                  ? () => onChangeClick(change.id)
                  : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function ChangeEntry({
  change,
  changeScope,
  dimmed,
  onClick,
}: {
  change: SemanticChange;
  changeScope?: ChangeScope;
  dimmed?: boolean;
  onClick?: () => void;
}) {
  const cfg = CATEGORY_CONFIG[change.category];
  const severityMod = SEVERITY_CSS_MODIFIERS[change.severity] || SEVERITY_CSS_MODIFIERS.info;
  const interactiveCls = onClick ? "change-entry--interactive" : "";
  const dimmedCls = dimmed ? "change-entry--dimmed" : "";

  // Locate the change by content ("the header", "the “Pricing” section").
  const locationLine = change.location;

  // Scope label — every change is tagged as either spanning all
  // breakpoints or being specific to certain ones, so the user can tell
  // universal changes from viewport-dependent ones at a glance.
  let scopeLabel: string | null = null;
  if (changeScope && changeScope.totalBps > 1) {
    if (changeScope.isUniversal(change)) {
      scopeLabel = "All";
    } else {
      const bps = changeScope.bpsFor(change);
      scopeLabel =
        bps.length === 1 ? `${bps[0]}px only` : `${bps.join(", ")}px`;
    }
  }

  return (
    <div
      onClick={onClick}
      className={`change-entry change-entry--${severityMod} ${interactiveCls} ${dimmedCls}`}
    >
      <span
        className="change-entry__icon"
        style={{ color: cfg.color }}
        title={cfg.label}
      >
        {cfg.icon}
      </span>
      <div className="change-entry__body">
        <span
          className="change-entry__description"
          title={change.descriptionFull ?? change.description}
        >
          {change.description}

        </span>
        {locationLine && (
          <span
            className="change-entry__selector"
            title={change.locationFull ?? locationLine}
          >
            {locationLine}
          </span>
        )}
        {scopeLabel && (
            <span className="change-entry__scope">Breakpoints: {scopeLabel}</span>
        )}
      </div>
    </div>
  );
}
