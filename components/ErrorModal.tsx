"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Structured payload for a single error display. Built by the caller —
 * for run-failure errors, see `describeUrlIssues` in lib/url-reachability.
 *
 * - `eyebrow`: small red preheader, optional. Sets the meta-context ("Test
 *   was not able to run").
 * - `title`: the largest piece — names the error class ("HTTPS handshake
 *   error").
 * - `body`: descriptive sentence(s).
 * - `hint`: optional ReactNode rendered below the body (e.g. a sentence
 *   with an inline link to a settings page).
 */
export interface ErrorModalDetails {
  eyebrow?: string;
  title: string;
  body: string;
  hint?: ReactNode;
}

interface Props {
  /** When non-null, the modal is open and shows these details. Null = closed. */
  error: ErrorModalDetails | null;
  /** Called on Esc, backdrop click, or "Close" button. */
  onClose: () => void;
}

/**
 * Centered error modal with a three-level hierarchy:
 *   eyebrow (small, red)  ← meta context
 *   title   (largest)     ← error class
 *   body    (regular)     ← what happened
 *   hint    (smaller)     ← what to do
 *
 * Reuses the .modal / .modal__panel styles so it visually matches other
 * modals in the app. The error-y treatment is a single red eyebrow line
 * plus a thin red rule beneath it — enough to read as "error" without
 * making the whole panel feel alarming.
 */
export default function ErrorModal({ error, onClose }: Props) {
  // Esc-to-dismiss. Bound only while the modal is actually open so we don't
  // leak listeners or interfere with shortcuts on other pages.
  useEffect(() => {
    if (!error) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [error, onClose]);

  if (!error) return null;

  return (
    <div
      className="modal modal--light-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="error-modal" role="alertdialog" aria-modal="true">
        {error.eyebrow && (
          <p className="error-modal__eyebrow">{error.eyebrow}</p>
        )}
        <h2 className="error-modal__title">{error.title}</h2>
        <p className="error-modal__body">{error.body}</p>
        {error.hint && <p className="error-modal__hint">{error.hint}</p>}
        <div className="error-modal__actions">
          <button onClick={onClose} className="btn btn--primary" autoFocus>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
