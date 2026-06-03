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
 *                Shows the green ✓.
 * - `invalid`  — red border + error icon.
 */
export type FieldStatus = "idle" | "valid" | "invalid" | "verified";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "ref"> {
  /** Label rendered above the input. */
  label: string;
  /** Small node rendered just after the label text (e.g. a `$VAR$` tag). */
  labelSuffix?: ReactNode;
  /** Trailing affordance inside the input. Defaults to the status icon;
   *  `copyValue` is a shortcut for a copy-to-clipboard button. */
  trailing?: ReactNode;
  /** Renders a copy-to-clipboard button as the trailing affordance. */
  copyValue?: string;
  /** Visual status — drives the border tint and the default trailing icon. */
  status?: FieldStatus;
  /** Help text below the input. Replaced by `error` when present. */
  hint?: ReactNode;
  /** Error message — overrides `hint` and forces invalid styling. */
  error?: string | null;
}

/** ms to wait after the last keystroke before surfacing an error. Errors
 *  shown while the user is mid-typing are noisy and create panic flickers
 *  ("https" → "Missing http://" → "https://" — fine). Blur skips the
 *  debounce so the user sees the error immediately when they leave. */
const ERROR_DEBOUNCE_MS = 500;

/**
 * The single labeled-input style across the app: a label above a plain
 * input, with optional hint / error text and a trailing affordance (status
 * icon or copy button). Spreads native input props and forwards a ref, so it
 * drops in wherever a bare `<input>` was used.
 *
 * For inline-edit affordances (click-to-rename a title) use a bare styled
 * input instead — a labeled field reads as "form," not "title."
 */
const Field = forwardRef<HTMLInputElement, Props>(function Field(
  { label, labelSuffix, trailing, copyValue, status = "idle", hint, error, className, id, onChange, onBlur, ...inputProps },
  ref,
) {
  const fieldId = id ?? `field-${label.toLowerCase().replace(/\s+/g, "-")}`;

  // Debounce error visibility: while the user is typing, suppress the invalid
  // styling + error caption until they pause (or blur). Initial render shows
  // the error so a pre-filled invalid value isn't silently masked.
  const [errorVisible, setErrorVisible] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorVisible(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setErrorVisible(true), ERROR_DEBOUNCE_MS);
    onChange?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    setErrorVisible(true);
    onBlur?.(e);
  };

  const showError = !!error && errorVisible;
  const effectiveStatus: FieldStatus = showError ? "invalid" : status;

  const trailingNode = trailing ?? (copyValue ? <CopyButton value={copyValue} /> : statusIcon(effectiveStatus));

  return (
    <div className="field">
      <label htmlFor={fieldId} className="field__label">
        {label}
        {labelSuffix}
      </label>
      <div className="field__control">
        <input
          ref={ref}
          id={fieldId}
          className={[
            "input",
            effectiveStatus === "invalid" && "input--error",
            trailingNode && "input--with-trailing",
            className,
          ].filter(Boolean).join(" ")}
          aria-invalid={effectiveStatus === "invalid" ? "true" : undefined}
          onChange={handleChange}
          onBlur={handleBlur}
          {...inputProps}
        />
        {trailingNode && <div className="field__trailing">{trailingNode}</div>}
      </div>
      {(showError || hint) && (
        <p className={`field__${showError ? "error" : "hint"}`}>{showError ? error : hint}</p>
      )}
    </div>
  );
});

function statusIcon(status: FieldStatus): ReactNode {
  if (status === "verified") {
    return <Icon name="check" size={16} className="field__status-icon field__status-icon--success" />;
  }
  if (status === "invalid") {
    return <Icon name="alert-circle" size={16} className="field__status-icon field__status-icon--error" />;
  }
  return null;
}

/** Copy-to-clipboard button sized for a field's trailing slot. Flashes a
 *  check on success. Exported so non-Field inputs can reuse the affordance. */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current ?? undefined);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — nothing to fall back to
    }
  };

  const title = copied ? "Copied!" : `Copy ${label ?? value}`;
  return (
    <button type="button" className="icon-btn icon-btn--sm" onClick={copy} title={title} aria-label={title}>
      <Icon name={copied ? "check" : "copy"} size={16} />
    </button>
  );
}

export default Field;
