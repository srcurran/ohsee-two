"use client";

import { useState } from "react";

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
    <div>
      <div className="mb-[8px] flex items-center gap-[8px]">
        <span className="text-[14px] text-foreground">Breakpoints</span>
        <span className="text-[12px] text-text-muted">
          {breakpoints.length}/{max}
        </span>
      </div>

      {/* Current breakpoints as removable chips */}
      <div className="mb-[12px] flex flex-wrap gap-[8px]">
        {sorted.map((bp) => (
          <div
            key={bp}
            className="flex items-center gap-[6px] rounded-[8px] border border-border-primary px-[12px] py-[6px] text-[13px] text-foreground"
          >
            {bp}px
            {breakpoints.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemove(bp)}
                className="text-text-muted transition-colors hover:text-foreground"
                aria-label={`Remove ${bp}px`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add input */}
      {breakpoints.length < max && (
        <div className="flex items-center gap-[8px]">
          <input
            type="number"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="e.g. 1280"
            className="w-[120px] rounded-[8px] border border-border-primary bg-transparent px-[12px] py-[8px] text-[14px] text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-foreground"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="rounded-[8px] bg-surface-tertiary px-[16px] py-[8px] text-[14px] text-foreground transition-colors hover:bg-foreground/10"
          >
            Add
          </button>
        </div>
      )}

      {error && (
        <p className="mt-[4px] text-[12px] text-status-error">{error}</p>
      )}
    </div>
  );
}
