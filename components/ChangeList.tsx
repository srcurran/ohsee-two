"use client";

import { useRef, useState } from "react";
import type { SemanticChange, ChangeCategory, ChangeSeverity } from "@/lib/types";
import { CATEGORY_CONFIG, SEVERITY_CSS_MODIFIERS } from "@/lib/colors";

/** Semantic landmark elements — these usually delineate page regions
 *  worth grouping by. Used to escape the "everything-is-#root" trap on
 *  React-like apps where the topmost selector segment is meaningless. */
const SEMANTIC_TAGS = new Set([
  "header", "main", "footer", "nav", "section", "article", "aside",
]);

/** Generic root wrappers worth skipping when no semantic landmark is
 *  available. Lowercased for cheap comparison. */
const GENERIC_WRAPPERS = new Set([
  "html", "body", "#root", "#__next", "#app",
]);

/** Pull the leading tag/id/class token out of a selector segment so we
 *  can compare against SEMANTIC_TAGS / GENERIC_WRAPPERS without worrying
 *  about pseudo-class / nth-of-type suffixes. */
function tagFromSegment(seg: string): string {
  const trimmed = seg.trim();
  // Bare leading `>` shows up when selectors have been rendered as
  // relative paths — strip it before tag extraction.
  const naked = trimmed.startsWith(">") ? trimmed.slice(1).trim() : trimmed;
  const match = naked.match(/^[a-zA-Z][\w-]*|^#[\w-]+|^\.[\w-]+/);
  return match ? match[0].toLowerCase() : naked.toLowerCase();
}

/**
 * Group key — pick a meaningful ancestor so changes in different page
 * regions land in different buckets.
 *
 *   1. Prefer the deepest semantic landmark (header/main/footer/...).
 *      This keeps changes in `<header>` separate from `<main>` even
 *      when both share `#root` as the outermost selector segment.
 *   2. Fall back to the first segment that isn't a generic root
 *      wrapper (#root, body, html, #__next, #app).
 *   3. As a last resort, use the original outermost segment so
 *      grouping is at worst no-op for unstructured pages.
 */
function topLevelSelector(sel: string): string {
  const parts = sel.split(" > ");
  if (parts.length === 0) return sel;

  let lastSemantic = -1;
  for (let i = 0; i < parts.length; i++) {
    if (SEMANTIC_TAGS.has(tagFromSegment(parts[i]))) lastSemantic = i;
  }
  if (lastSemantic >= 0) {
    return parts.slice(0, lastSemantic + 1).join(" > ");
  }

  for (const seg of parts) {
    if (!GENERIC_WRAPPERS.has(tagFromSegment(seg))) return seg;
  }
  return parts[0];
}

/**
 * Trailing portion of `child` after stripping the parent prefix. Empty string
 * means the change is on the parent element itself, so the entry can hide its
 * selector line entirely (the group header already shows the parent).
 */
function relativeSelector(parentSel: string, childSel: string): string {
  if (childSel === parentSel) return "";
  const prefix = parentSel + " > ";
  if (childSel.startsWith(prefix)) return "> " + childSel.slice(prefix.length);
  return childSel;
}

const SEVERITY_RANK: Record<ChangeSeverity, number> = { error: 0, warning: 1, info: 2 };

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
  onChangeClick?: (id: string) => void;
}

// How far the pointer must move before we treat the gesture as a drag and
// suppress the trailing click on whichever pill was under the cursor.
const DRAG_THRESHOLD_PX = 4;

export default function ChangeList({ changes, summary, onChangeClick }: ChangeListProps) {
  const [activeFilter, setActiveFilter] = useState<ChangeCategory | "all">("all");
  const filtersRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
    moved: boolean;
  } | null>(null);

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
  const definedOrder = Object.keys(CATEGORY_CONFIG) as ChangeCategory[];
  const categoryCounts: Record<ChangeCategory, number> = {} as Record<ChangeCategory, number>;
  for (const cat of definedOrder) {
    categoryCounts[cat] = summary?.[cat] ?? 0;
  }
  // Primary sort: count desc (most-frequent issue first). Secondary sort:
  // CATEGORY_CONFIG declaration order, preserved by Array.sort's stable
  // ordering for equal keys.
  const sortedCategories = [...definedOrder].sort(
    (a, b) => categoryCounts[b] - categoryCounts[a],
  );

  const filtered =
    activeFilter === "all"
      ? changes
      : changes.filter((c) => c.category === activeFilter);

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
            All ({changes.length})
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
        {groupBySelector(filtered).map((group) =>
          group.changes.length === 1 ? (
            <ChangeEntry
              key={group.changes[0].id}
              change={group.changes[0]}
              onClick={onChangeClick ? () => onChangeClick(group.changes[0].id) : undefined}
            />
          ) : (
            <ChangeGroup
              key={group.key}
              group={group}
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
  onChangeClick,
}: {
  group: SelectorGroup;
  onChangeClick?: (id: string) => void;
}) {
  const severityMod = SEVERITY_CSS_MODIFIERS[group.severity] || SEVERITY_CSS_MODIFIERS.info;
  return (
    <div className={`change-group change-group--${severityMod}`}>
      <div className="change-group__header">
        <span className="change-group__selector" title={group.selector}>
          {group.selector}
        </span>
        <span className="change-group__count">{group.changes.length}</span>
      </div>
      <div className="change-group__items">
        {group.changes.map((change) => (
          <ChangeEntry
            key={change.id}
            change={change}
            onClick={onChangeClick ? () => onChangeClick(change.id) : undefined}
            parentSelector={group.selector}
          />
        ))}
      </div>
    </div>
  );
}

function ChangeEntry({
  change,
  onClick,
  parentSelector,
}: {
  change: SemanticChange;
  onClick?: () => void;
  /** When set, the entry is rendered inside a ChangeGroup that already shows
   *  this prefix in its header — we drop the visual chrome (border, bg) and
   *  show only the trailing selector portion. */
  parentSelector?: string;
}) {
  const cfg = CATEGORY_CONFIG[change.category];
  const severityMod = SEVERITY_CSS_MODIFIERS[change.severity] || SEVERITY_CSS_MODIFIERS.info;
  const interactiveCls = onClick ? "change-entry--interactive" : "";
  const groupedCls = parentSelector ? "change-entry--grouped" : "";

  // In a group: show only the path under the group's parent selector (and
  // omit when the change is on the parent itself — the header makes that
  // obvious). Standalone: existing readable-selector behavior.
  const displaySelector = parentSelector
    ? relativeSelector(parentSelector, change.selector)
    : readableSelector(change.selector);

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
        <span className="change-entry__description">{change.description}</span>
        {displaySelector && change.details.prodValue && change.details.devValue && (
          <span className="change-entry__selector">{displaySelector}</span>
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
