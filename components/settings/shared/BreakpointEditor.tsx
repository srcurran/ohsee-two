"use client";

import { useState } from "react";
import { Icon } from "@/components/utility/Icon";

interface Props {
  breakpoints: number[];
  onChange: (breakpoints: number[]) => void;
  max?: number;
}

export default function BreakpointEditor({ breakpoints, onChange, max = 6 }: Props) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sorted = [...breakpoints].sort((a, b) => b - a);

  function handleAdd() {
    setError(null);
    const val = parseInt(inputValue, 10);
    if (isNaN(val)) {
      setError("Enter a number");
      return;
    }
    if (val < 200 || val > 3840) {
      setError("Must be 200–3840");
      return;
    }
    if (breakpoints.includes(val)) {
      setError("Already exists");
      return;
    }
    if (breakpoints.length >= max) {
      setError(`Maximum ${max} breakpoints`);
      return;
    }
    onChange([...breakpoints, val].sort((a, b) => b - a));
    setInputValue("");
  }

  function handleRemove(bp: number) {
    if (breakpoints.length <= 1) return;
    onChange(breakpoints.filter((b) => b !== bp));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <div className="breakpoint-editor">
      <div className="breakpoint-editor__header row row--sm">
        <h3>Breakpoints</h3>
        <span className="breakpoint-editor__count">
          {breakpoints.length}/{max}
        </span>
      </div>

      <div className="breakpoint-editor__chips cluster">
        {sorted.map((bp) => (
          <div key={bp} className="bp-chip">
            {bp}px
            {breakpoints.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemove(bp)}
                className="bp-chip__remove"
                aria-label={`Remove ${bp}px`}
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
        ))}
        <input
            type="number"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="e.g. 1280"
            className="input input--compact"
            style={{ width: 120 }}
        />
        <button
            type="button"
            onClick={handleAdd}
            className="btn btn--secondary"
        >
          Add
        </button>
      </div>

      {breakpoints.length < max && (
        <div className="row row--sm">

        </div>
      )}

      {error && <p className="error-text error-text--xs" style={{ marginTop: "var(--space-1)" }}>{error}</p>}
    </div>
  );
}
