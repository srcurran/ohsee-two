"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { Icon } from "@/components/utility/Icon";

/**
 * - `idle`     — neutral, no styling.
 * - `valid`    — format passes a sync check (e.g. URL parses). Silent: no
 *                border tint, no trailing icon. Format-level success isn't
 *                worth a green check; only confirmed reachability is.
 * - `verified` — actually verified end-to-end (e.g. HEAD-checked URL).
 *                Shows the green ✓. Reserve for cases where we've proven the
 *                target works.
 * - `invalid`  — red border + error icon.
 */
export type MaterialFieldStatus = "idle" | "valid" | "invalid" | "verified";

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
/** ms to wait after the last keystroke before surfacing an error. Errors
 *  shown while the user is mid-typing are noisy and create panic flickers
 *  ("https" → "Missing http://" → "https://" — fine). Blur skips the
 *  debounce so the user sees the error immediately when they leave the
 *  field. */
const ERROR_DEBOUNCE_MS = 500;

const MaterialField = forwardRef<HTMLInputElement, Props>(function MaterialField(
  { label, trailing, status = "idle", hint, error, className, id, onChange, onBlur, ...inputProps },
  ref,
) {
  const fieldId = id ?? `mf-${label.toLowerCase().replace(/\s+/g, "-")}`;

  // Debounce error visibility: while the user is typing, suppress the
  // invalid styling + error caption until they pause for ERROR_DEBOUNCE_MS
  // (or blur). Initial render shows the error so a pre-filled invalid
  // value isn't silently masked.
  const [errorVisible, setErrorVisible] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorVisible(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setErrorVisible(true), ERROR_DEBOUNCE_MS);
    onChange?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setErrorVisible(true);
    onBlur?.(e);
  };

  const showError = !!error && errorVisible;
  const effectiveStatus: MaterialFieldStatus = showError
    ? "invalid"
    : error
      ? status
      : status;

  const trailingNode = trailing ?? defaultTrailing(effectiveStatus);

  return (
    <div className="material-field stack stack--xs">
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
            onChange={handleChange}
            onBlur={handleBlur}
            {...inputProps}
          />
        </div>
        {trailingNode && <div className="material-field__trailing">{trailingNode}</div>}
      </div>
      {(showError || hint) && (
        <p className={`material-field__caption ${showError ? "material-field__caption--error" : ""}`}>
          {showError ? error : hint}
        </p>
      )}
    </div>
  );
});

function defaultTrailing(status: MaterialFieldStatus): ReactNode {
  if (status === "verified") {
    return (
      <Icon name="check" size={16} className="material-field__icon material-field__icon--success" />
    );
  }
  if (status === "invalid") {
    return (
      <Icon name="alert-circle" size={16} className="material-field__icon material-field__icon--error" />
    );
  }
  return null;
}

export default MaterialField;
