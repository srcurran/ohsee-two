"use client";

import type { ReactNode } from "react";

interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface Props<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Extra root modifiers, e.g. "segmented--fit" / "segmented--lg". */
  className?: string;
}

/**
 * Segmented control — a small group of mutually-exclusive options (the
 * pill-style mode selector). One component for every N-choice toggle
 * (theme picker, TOTP/static, tap/slider, …) so the active-item wiring
 * isn't re-hand-rolled per caller.
 */
export default function Segmented<T extends string>({ options, value, onChange, className }: Props<T>) {
  return (
    <div className={["segmented", className].filter(Boolean).join(" ")}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`segmented__item ${opt.value === value ? "segmented__item--active" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
