"use client";

import type { ReactNode } from "react";

interface AccordionSectionProps {
  label: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export default function AccordionSection({
  label,
  count,
  open,
  onToggle,
  children,
}: AccordionSectionProps) {
  return (
    <section className="accordion">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="accordion__toggle"
      >
        <span className="accordion__label">{label}</span>
        {count !== undefined && (
          <span className="accordion__count">({count})</span>
        )}
        <span className="accordion__chevron-wrap">
          <Chevron open={open} />
        </span>
      </button>
      {open && <div className="accordion__body">{children}</div>}
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
      className={`accordion__chevron ${open ? "accordion__chevron--open" : ""}`}
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
