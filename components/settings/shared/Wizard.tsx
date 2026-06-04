"use client";

import { type ReactNode, useState } from "react";
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
 * The host swaps `children` and bumps `step`; the shell persists across steps
 * (same tree position) so it owns the cross-step transition: it compares the
 * new `step` against the previous render to pick a slide direction, then keys
 * the body on `step` so the incoming content remounts and replays the slide.
 * The panel is capped to the viewport with a consistent min-height body that
 * scrolls — so the frame neither jumps between steps nor outgrows the window.
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

  // Direction of the most recent step change, for the slide animation. Uses the
  // store-previous-render-value pattern (adjusting state during render, which
  // React resolves before paint) so `direction` is already correct on the same
  // render the body remounts. Going to a higher step → "forward" (slide in from
  // the right); lower → "back".
  const [prevStep, setPrevStep] = useState(step);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  if (step !== prevStep) {
    setDirection(step < prevStep ? "back" : "forward");
    setPrevStep(step);
  }

  return (
    <div
      className="modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal__panel modal__panel--md modal__panel--wizard">
        <div className="wizard__head row row--between row--xs">
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

        <div
          key={step}
          className={`wizard__body stack stack--lg wizard__body--${direction}`}
        >
          {children}
        </div>

        <div className="wizard__footer row row--between">
          <span className="wizard__step-count" aria-hidden>
            {step}/{totalSteps}
          </span>
          <div className="row">
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
