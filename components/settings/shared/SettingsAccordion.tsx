/** Disclosure block used by the test-settings overlay for "Test settings",
 * "Credentials", and "Danger Zone". Pure presentation — the parent owns
 * which (single) accordion is open. */

"use client";

interface AccordionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function Accordion({ title, open, onToggle, children }: AccordionProps) {
  return (
    <div className={`ts-accordion ${open ? "ts-accordion--open" : ""}`}>
      <button
        type="button"
        className="settings-overlay__danger-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="settings-overlay__section-title">{title}</span>
        <span
          className={`ts-accordion__glyph ${open ? "ts-accordion__glyph--open" : ""}`}
          aria-hidden="true"
        />
      </button>
      <div className="ts-accordion__collapse" aria-hidden={!open}>
        <div className="ts-accordion__collapse-inner">
          <div className="ts-accordion__body">{children}</div>
        </div>
      </div>
    </div>
  );
}
