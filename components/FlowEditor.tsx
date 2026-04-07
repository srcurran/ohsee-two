"use client";

import { useState } from "react";
import FlowRecorderModal from "@/components/FlowRecorderModal";
import type { FlowEntry, FlowAction } from "@/lib/types";

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

/** Whether a step will produce a screenshot (default true for action steps). */
export function stepCapturesScreenshot(step: FlowAction): boolean {
  if (step.type === "screenshot") return true;
  return step.captureScreenshot !== false;
}

function CameraIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={active ? "text-foreground" : "text-text-muted/30"}>
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
        stroke={active ? "var(--color-surface-content, #fff)" : "currentColor"}
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
}

function StepFields({
  step,
  onChange,
}: {
  step: FlowAction;
  onChange: (s: FlowAction) => void;
}) {
  const inputClass =
    "flex-1 rounded-[6px] border border-border-primary bg-transparent px-[8px] py-[4px] text-[13px] text-foreground outline-none placeholder:text-text-muted focus:border-foreground";

  switch (step.type) {
    case "click":
      return (
        <input
          type="text"
          value={step.selector}
          onChange={(e) => onChange({ ...step, selector: e.target.value })}
          placeholder='CSS selector, e.g. button:has-text("Next")'
          className={inputClass}
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
            className={inputClass}
          />
          <input
            type="text"
            value={step.value}
            onChange={(e) => onChange({ ...step, value: e.target.value })}
            placeholder="Value to fill"
            className={inputClass}
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
          className={`${inputClass} w-[100px]`}
        />
      );
    case "waitForSelector":
      return (
        <input
          type="text"
          value={step.selector}
          onChange={(e) => onChange({ ...step, selector: e.target.value })}
          placeholder="CSS selector to wait for"
          className={inputClass}
        />
      );
    case "navigate":
      return (
        <input
          type="text"
          value={step.path}
          onChange={(e) => onChange({ ...step, path: e.target.value })}
          placeholder="/path"
          className={inputClass}
        />
      );
    case "screenshot":
      // Legacy standalone screenshot step
      return (
        <input
          type="text"
          value={step.label}
          onChange={(e) => onChange({ ...step, label: e.target.value })}
          placeholder="Screenshot label"
          className={inputClass}
        />
      );
  }
}

export function FlowEditor({
  flow,
  onChange,
  onRemove,
}: {
  flow: FlowEntry;
  onChange: (updated: FlowEntry) => void;
  onRemove: () => void;
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
    if (step.type === "screenshot") return; // legacy steps always capture
    const steps = [...flow.steps];
    steps[idx] = { ...step, captureScreenshot: step.captureScreenshot === false ? true : false } as FlowAction;
    onChange({ ...flow, steps });
  };

  return (
    <div className="rounded-[12px] border border-border-primary p-[16px]">
      <div className="mb-[12px] flex items-center justify-between">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-[8px] text-[16px] font-bold text-foreground"
        >
          <span className="text-[12px] text-text-muted">{collapsed ? "\u25B6" : "\u25BC"}</span>
          {flow.name || "Untitled Flow"}
        </button>
        <button
          onClick={onRemove}
          className="text-[12px] text-text-muted transition-colors hover:text-foreground"
        >
          Remove
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Flow name & start path */}
          <div className="mb-[12px] flex gap-[8px]">
            <input
              type="text"
              value={flow.name}
              onChange={(e) => onChange({ ...flow, name: e.target.value })}
              placeholder="Flow name"
              className="flex-1 rounded-[8px] border border-border-primary bg-transparent px-[12px] py-[8px] text-[14px] text-foreground outline-none placeholder:text-text-muted focus:border-foreground"
            />
            <input
              type="text"
              value={flow.startPath}
              onChange={(e) => onChange({ ...flow, startPath: e.target.value })}
              placeholder="/start-path"
              className="w-[200px] rounded-[8px] border border-border-primary bg-transparent px-[12px] py-[8px] text-[14px] text-foreground outline-none placeholder:text-text-muted focus:border-foreground"
            />
          </div>

          {/* Steps */}
          <div className="mb-[12px] space-y-[8px]">
            {flow.steps.map((step, idx) => (
              <div
                key={step.id}
                className="flex items-center gap-[8px] rounded-[8px] border border-border-primary bg-surface-secondary p-[8px]"
              >
                {/* Reorder arrows */}
                <div className="flex flex-col text-[10px] text-text-muted">
                  <button onClick={() => moveStep(idx, -1)} className="hover:text-foreground">{"\u25B2"}</button>
                  <button onClick={() => moveStep(idx, 1)} className="hover:text-foreground">{"\u25BC"}</button>
                </div>

                {/* Step number & type badge */}
                <span className="w-[24px] text-center text-[12px] text-text-muted">{idx + 1}</span>
                <span className="rounded-[4px] bg-surface-tertiary px-[6px] py-[2px] text-[11px] font-bold text-text-muted">
                  {step.type}
                </span>

                {/* Step fields */}
                <div className="flex flex-1 gap-[8px]">
                  <StepFields step={step} onChange={(s) => updateStep(idx, s)} />
                </div>

                {/* Screenshot toggle */}
                {step.type !== "screenshot" && (
                  <button
                    onClick={() => toggleScreenshot(idx)}
                    className="flex-shrink-0 transition-opacity hover:opacity-70"
                    title={stepCapturesScreenshot(step) ? "Screenshot enabled — click to disable" : "Screenshot disabled — click to enable"}
                  >
                    <CameraIcon active={stepCapturesScreenshot(step)} />
                  </button>
                )}

                <button
                  onClick={() => removeStep(idx)}
                  className="text-[12px] text-text-muted transition-colors hover:text-foreground"
                >
                  x
                </button>
              </div>
            ))}

            {flow.steps.length === 0 && (
              <p className="py-[8px] text-center text-[13px] text-text-muted">
                Add steps to this flow.
              </p>
            )}
          </div>

          {/* Add step buttons */}
          <div className="flex flex-wrap items-center gap-[4px]">
            {ACTION_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => addStep(type)}
                className="rounded-[6px] bg-surface-tertiary px-[10px] py-[4px] text-[12px] text-text-muted transition-colors hover:bg-foreground/10 hover:text-foreground"
              >
                + {type}
              </button>
            ))}
            <span className="mx-[4px] text-[12px] text-text-muted">or</span>
            <button
              onClick={() => setShowRecorder(true)}
              className="rounded-[6px] bg-accent-primary/10 px-[10px] py-[4px] text-[12px] font-bold text-accent-primary transition-colors hover:bg-accent-primary/20"
            >
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
