"use client";

import { type ReactNode } from "react";
import { Icon } from "@/components/utility/Icon";

interface Props {
  /** Accepted for call-site clarity; the header is icon-only so it isn't
   *  rendered. */
  title?: string;
  step: number;
  totalSteps: number;
  /** Right-side primary button label. */
  nextLabel?: string;
  /** When true, the primary button is disabled. */
  nextDisabled?: boolean;
  /** When true (e.g. while a request is in flight), the primary button reads
   *  the same label but renders disabled with a loading affordance. */
  busy?: boolean;
  /** Optional secondary action rendered as an outline button left of the
   *  primary — e.g. "Save" sitting beside "Run" on the final step. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Hide the primary button entirely — used when the step's own body
   *  carries the forward action (e.g. a simple/advanced choice screen). */
  hideNext?: boolean;
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
  step,
  totalSteps,
  nextLabel = "Next",
  nextDisabled,
  busy,
  secondaryLabel,
  onSecondary,
  hideNext,
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
          {showPrev ? (
            <button
              type="button"
              className="icon-btn"
              onClick={onPrev}
              aria-label="Back"
              title="Back"
            >
              <Icon name="chevron-left" size={20} />
            </button>
          ) : (
            <span aria-hidden />
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="wizard__body">{children}</div>

        <div className="wizard__footer">
          <span className="wizard__step-count" aria-hidden>
            {step}/{totalSteps}
          </span>
          <div className="wizard__footer-actions">
            {secondaryLabel && onSecondary ? (
              <button
                type="button"
                className="btn btn--outline"
                onClick={onSecondary}
                disabled={busy}
              >
                {secondaryLabel}
              </button>
            ) : null}
            {!hideNext && (
              <button
                type="button"
                className="btn btn--primary"
                onClick={onNext}
                disabled={nextDisabled || busy}
              >
                {busy ? "…" : nextLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
