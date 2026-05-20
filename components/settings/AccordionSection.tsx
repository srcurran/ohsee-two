"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/utility/Icon";

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
    <Icon
      name="chevron-down"
      size={14}
      className={`accordion__chevron ${open ? "accordion__chevron--open" : ""}`}
    />
  );
}
