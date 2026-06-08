"use client";

import type { ReactNode } from "react";

export interface TabItem<T extends string | number> {
  id: T;
  label: ReactNode;
  /** Optional content after the label (e.g. a change dot or count badge). */
  trailing?: ReactNode;
}

interface Props<T extends string | number> {
  items: TabItem<T>[];
  active: T;
  onSelect: (id: T) => void;
  align?: "start" | "center";
}

/**
 * Underline tab bar — the `.tab-bar` row of `.tab` buttons with an active
 * underline. One component for every tab strip (settings sections, the
 * report breakpoint switcher, …); per-item extras (e.g. a change dot) ride
 * in the `trailing` slot so callers don't re-hand-roll the markup.
 */
export default function TabBar<T extends string | number>({ items, active, onSelect, align = "start" }: Props<T>) {
  return (
    <div className="tab-bar">
      <div className={`tab-bar__list tab-bar__list--${align}`}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`tab ${item.id === active ? "tab--active" : ""}`}
          >
            {item.label}
            {item.trailing}
            {item.id === active && <span className="tab__indicator" />}
          </button>
        ))}
      </div>
    </div>
  );
}
