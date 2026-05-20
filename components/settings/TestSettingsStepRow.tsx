/** One row in the test-settings step list — drag handle, type icon, label
 * button, capture-screenshot toggle, and remove button. Companion
 * `PendingDeleteRow` is rendered in the spot a freshly-deleted step
 * occupied until the 3 s undo grace elapses. */

"use client";

import type { TestStep } from "@/lib/types";
import { Icon } from "@/components/utility/Icon";
import { stepLabel } from "@/components/settings/utils/testSteps";

interface StepRowProps {
  step: TestStep;
  dragging?: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onEdit: () => void;
  onToggleScreenshot: () => void;
  onRemove: () => void;
}

export function StepRow({
  step,
  dragging,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onEdit,
  onToggleScreenshot,
  onRemove,
}: StepRowProps) {
  const label = stepLabel(step);
  const captureOn = step.captureScreenshot !== false;

  return (
    <li
      className={`step-row${dragging ? " step-row--dragging" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
    >
      <span className="step-row__grip" aria-hidden="true">
        <Icon name="grip" size={16} />
      </span>

      <span
        className={`step-row__type-icon step-row__type-icon--${step.type}`}
        title={step.type === "url" ? "URL step" : "Playwright step"}
        aria-hidden="true"
      >
        {step.type === "url" ? <Icon name="globe" size={16} /> : <Icon name="playwright" size={16} />}
      </span>

      <button type="button" className="step-row__label" onClick={onEdit} title="Edit step">
        {label}
      </button>

      <div className="step-row__actions">
        <button
          type="button"
          onClick={onToggleScreenshot}
          className={`icon-btn step-row__camera ${captureOn ? "step-row__camera--on" : "step-row__camera--off"}`}
          title={captureOn ? "Capturing screenshot" : "Screenshot disabled"}
          aria-pressed={captureOn}
        >
          <Icon name="camera" size={16} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="icon-btn step-row__trash"
          title="Remove step"
        >
          <Icon name="trash" size={16} />
        </button>
      </div>
    </li>
  );
}

interface PendingDeleteRowProps {
  step: TestStep;
  onUndo: () => void;
}

export function PendingDeleteRow({ step, onUndo }: PendingDeleteRowProps) {
  const label = stepLabel(step);
  return (
    <li className="step-row step-row--deleted" aria-live="polite">
      <span className="step-row__deleted-label">Deleted: {label}</span>
      <button type="button" className="btn btn--text step-row__undo" onClick={onUndo}>
        Undo
      </button>
    </li>
  );
}
