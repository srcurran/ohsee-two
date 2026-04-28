"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

export type MaterialFieldStatus = "idle" | "valid" | "invalid";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "ref"> {
  /** Label rendered above the value (always visible — material-style). */
  label: string;
  /** Optional content rendered to the right of the value (icon, button, etc.). */
  trailing?: ReactNode;
  /** Visual status — drives the border tint and the default trailing icon. */
  status?: MaterialFieldStatus;
  /** Help text below the field. Replaced by `error` when present. */
  hint?: ReactNode;
  /** Error message — overrides `hint` and forces invalid styling. */
  error?: string | null;
}

/**
 * Label-above-value field with a subtle bordered surface, modeled on the
 * Google Material outlined-text-field pattern. The label is small, the
 * value is the dominant element, and an optional trailing slot (default:
 * a status icon) sits flush right.
 *
 * Designed to be the single field style across the app (URL inputs, names,
 * etc.). For inline-edit affordances (click-to-rename a title), use a
 * different pattern — material framing reads as "form" not "title."
 */
const MaterialField = forwardRef<HTMLInputElement, Props>(function MaterialField(
  { label, trailing, status = "idle", hint, error, className, id, ...inputProps },
  ref,
) {
  const fieldId = id ?? `mf-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const effectiveStatus: MaterialFieldStatus = error ? "invalid" : status;

  const trailingNode = trailing ?? defaultTrailing(effectiveStatus);

  return (
    <div className="material-field">
      <div
        className={[
          "material-field__shell",
          `material-field__shell--${effectiveStatus}`,
          className,
        ].filter(Boolean).join(" ")}
      >
        <div className="material-field__main">
          <label htmlFor={fieldId} className="material-field__label">{label}</label>
          <input
            ref={ref}
            id={fieldId}
            className="material-field__input"
            aria-invalid={effectiveStatus === "invalid" ? "true" : undefined}
            {...inputProps}
          />
        </div>
        {trailingNode && <div className="material-field__trailing">{trailingNode}</div>}
      </div>
      {(error || hint) && (
        <p className={`material-field__caption ${error ? "material-field__caption--error" : ""}`}>
          {error || hint}
        </p>
      )}
    </div>
  );
});

function defaultTrailing(status: MaterialFieldStatus): ReactNode {
  if (status === "valid") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="material-field__icon material-field__icon--success"
      >
        <path d="M5 12l5 5 9-11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "invalid") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="material-field__icon material-field__icon--error"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="1" fill="currentColor" />
      </svg>
    );
  }
  return null;
}

export default MaterialField;
