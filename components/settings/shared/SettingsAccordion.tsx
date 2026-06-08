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
    <div className={`settings-accordion ${open ? "settings-accordion--open" : ""}`}>
      <button
        type="button"
        className="settings-overlay__danger-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="settings-overlay__section-title">{title}</span>
        <span
          className={`settings-accordion__glyph ${open ? "settings-accordion__glyph--open" : ""}`}
          aria-hidden="true"
        />
      </button>
      <div className="settings-accordion__collapse" aria-hidden={!open}>
        <div className="settings-accordion__collapse-inner">
          <div className="settings-accordion__body">{children}</div>
        </div>
      </div>
    </div>
  );
}
