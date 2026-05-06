"use client";

import { type ReactNode } from "react";

interface Props {
  title: string;
  step: number;
  totalSteps: number;
  /** Right-side primary button label. */
  nextLabel?: string;
  /** When true, the primary button is disabled. */
  nextDisabled?: boolean;
  /** When true (e.g. while a request is in flight), the primary button reads
   *  the same label but renders disabled with a loading affordance. */
  busy?: boolean;
  onPrev?: () => void;
  onNext: () => void;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Stepped-modal shell shared by NewProjectWizard and NewTestWizard. Renders
 * the standard `.modal` scrim + panel chrome with a title row, a body slot
 * for the active step, and a Previous / Primary footer.
 *
 * The shell intentionally has no transition logic between steps — the host
 * component swaps `children` and the user perceives it as a step change.
 * Keeps state ownership in one place and avoids fighting with react keys.
 */
export default function Wizard({
  title,
  step,
  totalSteps,
  nextLabel = "Next",
  nextDisabled,
  busy,
  onPrev,
  onNext,
  onClose,
  children,
}: Props) {
  const showPrev = step > 1 && !!onPrev;
  return (
    <div
      className="modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal__panel modal__panel--md">
        <div className="wizard__head">
          <h2 className="wizard__title">{title}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="wizard__body">{children}</div>

        <div className="wizard__footer">
          <span className="wizard__step-count" aria-hidden>
            {step}/{totalSteps}
          </span>
          <div className="wizard__footer-actions">
            <button
              type="button"
              className="btn btn--outline"
              onClick={onPrev}
              disabled={!showPrev || busy}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={onNext}
              disabled={nextDisabled || busy}
            >
              {busy ? "…" : nextLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
