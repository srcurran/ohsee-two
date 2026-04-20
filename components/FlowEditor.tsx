"use client";

import { useState } from "react";
import FlowRecorderModal from "@/components/FlowRecorderModal";
import type { FlowEntry, FlowAction } from "@/lib/types";
import { resolveProjectPath } from "@/lib/url-utils";

const ACTION_TYPES = ["click", "fill", "wait", "waitForSelector", "navigate"] as const;

export function newStep(type: (typeof ACTION_TYPES)[number]): FlowAction {
  const id = crypto.randomUUID();
  switch (type) {
    case "click":
      return { id, type: "click", selector: "" };
    case "fill":
      return { id, type: "fill", selector: "", value: "" };
    case "wait":
      return { id, type: "wait", ms: 1000 };
    case "waitForSelector":
      return { id, type: "waitForSelector", selector: "" };
    case "navigate":
      return { id, type: "navigate", path: "/" };
  }
}

export function stepCapturesScreenshot(step: FlowAction): boolean {
  if (step.type === "screenshot") return true;
  return step.captureScreenshot !== false;
}

function CameraIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      style={{ color: active ? "var(--foreground)" : "color-mix(in srgb, var(--text-muted) 30%, transparent)" }}
    >
      <path
        d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={active ? "currentColor" : "none"}
      />
      <circle
        cx="12"
        cy="13"
        r="4"
        stroke={active ? "var(--surface-content)" : "currentColor"}
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
}

/**
 * Text input that expects a project-relative path. On blur, rewrites pasted
 * full URLs down to a path if they match allowedDomainUrls, or shows an
 * inline error if the URL is from a foreign domain.
 */
function PathInput({
  value,
  onChange,
  placeholder,
  allowedDomainUrls,
  className,
  style,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  allowedDomainUrls?: string[];
  className?: string;
  style?: React.CSSProperties;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="stack stack--xs" style={{ flex: 1 }}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (error) setError(null);
        }}
        onBlur={() => {
          if (!value.trim()) return;
          const result = resolveProjectPath(value, allowedDomainUrls ?? []);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          if (result.path !== value) onChange(result.path);
        }}
        placeholder={placeholder}
        className={`input input--sm ${error ? "input--error" : ""} ${className ?? ""}`}
        style={style}
      />
      {error && <p className="error-text error-text--xs">{error}</p>}
    </div>
  );
}

function StepFields({
  step,
  onChange,
  allowedDomainUrls,
}: {
  step: FlowAction;
  onChange: (s: FlowAction) => void;
  allowedDomainUrls?: string[];
}) {
  switch (step.type) {
    case "click":
      return (
        <input
          type="text"
          value={step.selector}
          onChange={(e) => onChange({ ...step, selector: e.target.value })}
          placeholder='CSS selector, e.g. button:has-text("Next")'
          className="input input--sm"
          style={{ flex: 1 }}
        />
      );
    case "fill":
      return (
        <>
          <input
            type="text"
            value={step.selector}
            onChange={(e) => onChange({ ...step, selector: e.target.value })}
            placeholder="CSS selector"
            className="input input--sm"
            style={{ flex: 1 }}
          />
          <input
            type="text"
            value={step.value}
            onChange={(e) => onChange({ ...step, value: e.target.value })}
            placeholder="Value to fill"
            className="input input--sm"
            style={{ flex: 1 }}
          />
        </>
      );
    case "wait":
      return (
        <input
          type="number"
          value={step.ms}
          onChange={(e) => onChange({ ...step, ms: parseInt(e.target.value) || 0 })}
          placeholder="ms"
          className="input input--sm"
          style={{ width: 100 }}
        />
      );
    case "waitForSelector":
      return (
        <input
          type="text"
          value={step.selector}
          onChange={(e) => onChange({ ...step, selector: e.target.value })}
          placeholder="CSS selector to wait for"
          className="input input--sm"
          style={{ flex: 1 }}
        />
      );
    case "navigate":
      return (
        <PathInput
          value={step.path}
          onChange={(next) => onChange({ ...step, path: next })}
          placeholder="/path"
          allowedDomainUrls={allowedDomainUrls}
        />
      );
    case "screenshot":
      return (
        <input
          type="text"
          value={step.label}
          onChange={(e) => onChange({ ...step, label: e.target.value })}
          placeholder="Screenshot label"
          className="input input--sm"
          style={{ flex: 1 }}
        />
      );
  }
}

export function FlowEditor({
  flow,
  onChange,
  onRemove,
  allowedDomainUrls,
}: {
  flow: FlowEntry;
  onChange: (updated: FlowEntry) => void;
  onRemove: () => void;
  allowedDomainUrls?: string[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);

  const updateStep = (stepIdx: number, updated: FlowAction) => {
    const steps = [...flow.steps];
    steps[stepIdx] = updated;
    onChange({ ...flow, steps });
  };

  const removeStep = (stepIdx: number) => {
    onChange({ ...flow, steps: flow.steps.filter((_, i) => i !== stepIdx) });
  };

  const addStep = (type: (typeof ACTION_TYPES)[number]) => {
    onChange({ ...flow, steps: [...flow.steps, newStep(type)] });
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= flow.steps.length) return;
    const steps = [...flow.steps];
    [steps[idx], steps[target]] = [steps[target], steps[idx]];
    onChange({ ...flow, steps });
  };

  const toggleScreenshot = (idx: number) => {
    const step = flow.steps[idx];
    if (step.type === "screenshot") return;
    const steps = [...flow.steps];
    steps[idx] = { ...step, captureScreenshot: step.captureScreenshot === false ? true : false } as FlowAction;
    onChange({ ...flow, steps });
  };

  return (
    <div className="flow-editor">
      <div className="flow-editor__header">
        <button onClick={() => setCollapsed(!collapsed)} className="flow-editor__toggle">
          <span className="flow-editor__chevron">{collapsed ? "\u25B6" : "\u25BC"}</span>
          {flow.name || "Untitled Flow"}
        </button>
        <button onClick={onRemove} className="flow-step__remove">
          Remove
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="flow-editor__meta">
            <input
              type="text"
              value={flow.name}
              onChange={(e) => onChange({ ...flow, name: e.target.value })}
              placeholder="Flow name"
              className="input input--compact"
              style={{ flex: 1 }}
            />
            <PathInput
              value={flow.startPath}
              onChange={(next) => onChange({ ...flow, startPath: next })}
              placeholder="/start-path"
              allowedDomainUrls={allowedDomainUrls}
              style={{ width: 200, padding: "var(--space-2) var(--space-3)", fontSize: "var(--font-size-base)", borderRadius: "var(--radius-md)" }}
            />
          </div>

          <div className="flow-editor__steps">
            {flow.steps.map((step, idx) => (
              <div key={step.id} className="flow-step">
                <div className="flow-step__reorder">
                  <button onClick={() => moveStep(idx, -1)} className="flow-step__reorder-btn">{"\u25B2"}</button>
                  <button onClick={() => moveStep(idx, 1)} className="flow-step__reorder-btn">{"\u25BC"}</button>
                </div>

                <span className="flow-step__index">{idx + 1}</span>
                <span className="flow-step__kind">{step.type}</span>

                <div className="flow-step__fields">
                  <StepFields
                    step={step}
                    onChange={(s) => updateStep(idx, s)}
                    allowedDomainUrls={allowedDomainUrls}
                  />
                </div>

                {step.type !== "screenshot" && (
                  <button
                    onClick={() => toggleScreenshot(idx)}
                    className="flow-step__camera"
                    title={stepCapturesScreenshot(step) ? "Screenshot enabled — click to disable" : "Screenshot disabled — click to enable"}
                  >
                    <CameraIcon active={stepCapturesScreenshot(step)} />
                  </button>
                )}

                <button onClick={() => removeStep(idx)} className="flow-step__remove">
                  x
                </button>
              </div>
            ))}

            {flow.steps.length === 0 && (
              <p className="flow-editor__empty">Add steps to this flow.</p>
            )}
          </div>

          <div className="flow-editor__add-row">
            {ACTION_TYPES.map((type) => (
              <button key={type} onClick={() => addStep(type)} className="flow-chip">
                + {type}
              </button>
            ))}
            <span className="flow-editor__separator">or</span>
            <button onClick={() => setShowRecorder(true)} className="flow-chip flow-chip--accent">
              Record
            </button>
          </div>

          {showRecorder && (
            <FlowRecorderModal
              onImport={(steps) => {
                onChange({ ...flow, steps: [...flow.steps, ...steps] });
                setShowRecorder(false);
              }}
              onClose={() => setShowRecorder(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
