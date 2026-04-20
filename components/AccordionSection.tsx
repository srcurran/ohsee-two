"use client";

import type { ReactNode } from "react";

interface AccordionSectionProps {
  label: string;
  /** Optional count shown as "(N)" next to the label. */
  count?: number;
  /** Whether this section is currently expanded. */
  open: boolean;
  /** Toggle handler — call the parent to expand/collapse. */
  onToggle: () => void;
  children: ReactNode;
}

/**
 * Card-style accordion. Entire header row is the toggle target — no chevron,
 * no plus icon, just label + optional (count). Parent owns the open state so
 * callers can enforce "one open at a time".
 */
export default function AccordionSection({
  label,
  count,
  open,
  onToggle,
  children,
}: AccordionSectionProps) {
  return (
    <section className="mb-[12px] overflow-hidden rounded-[12px] border border-border-primary bg-surface-primary">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-[8px] px-[20px] py-[14px] text-left"
      >
        <span className="text-[14px] font-bold text-foreground">{label}</span>
        {count !== undefined && (
          <span className="text-[13px] font-normal text-text-muted">({count})</span>
        )}
        <span className="ml-auto text-text-muted">
          <Chevron open={open} />
        </span>
      </button>
      {open && <div className="px-[20px] pb-[20px]">{children}</div>}
    </section>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
