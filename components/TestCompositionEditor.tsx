"use client";

import { useState } from "react";
import MicroTestEditor from "./MicroTestEditor";
import type { MicroTest, TestComposition, TestCompositionStep } from "@/lib/types";

interface Props {
  projectId: string;
  composition: TestComposition;
  microTests: MicroTest[];
  onChange: (updated: TestComposition) => void;
  onRemove: () => void;
  onMicroTestsChange: (updated: MicroTest[]) => void;
}

export default function TestCompositionEditor({
  projectId,
  composition,
  microTests,
  onChange,
  onRemove,
  onMicroTestsChange,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [editingMicroTestId, setEditingMicroTestId] = useState<string | null>(null);
  const [showAddStep, setShowAddStep] = useState(false);

  const editingMicroTest = editingMicroTestId
    ? microTests.find((mt) => mt.id === editingMicroTestId)
    : null;

  if (editingMicroTest) {
    return (
      <div className="card card--sm card--bordered">
        <MicroTestEditor
          projectId={projectId}
          microTest={editingMicroTest}
          onSave={(updated) => {
            onMicroTestsChange(
              microTests.map((mt) => (mt.id === updated.id ? updated : mt))
            );
          }}
          onClose={() => setEditingMicroTestId(null)}
        />
      </div>
    );
  }

  const updateStep = (stepId: string, updates: Partial<TestCompositionStep>) => {
    onChange({
      ...composition,
      steps: composition.steps.map((s) =>
        s.id === stepId ? { ...s, ...updates } : s
      ),
    });
  };

  const removeStep = (stepId: string) => {
    onChange({
      ...composition,
      steps: composition.steps.filter((s) => s.id !== stepId),
    });
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= composition.steps.length) return;
    const steps = [...composition.steps];
    [steps[index], steps[newIndex]] = [steps[newIndex], steps[index]];
    onChange({ ...composition, steps });
  };

  const addStep = (microTestId: string) => {
    const step: TestCompositionStep = {
      id: crypto.randomUUID(),
      microTestId,
      captureScreenshot: true,
    };
    onChange({
      ...composition,
      steps: [...composition.steps, step],
    });
    setShowAddStep(false);
  };

  const createAndAddMicroTest = async () => {
    const res = await fetch(`/api/projects/${projectId}/micro-tests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `step${microTests.length + 1}`,
        displayName: `Step ${microTests.length + 1}`,
        script: '// Write your Playwright script here\nawait page.waitForTimeout(1000);',
      }),
    });

    if (res.ok) {
      const mt: MicroTest = await res.json();
      onMicroTestsChange([...microTests, mt]);
      addStep(mt.id);
      setEditingMicroTestId(mt.id);
    }
  };

  const getMicroTestName = (microTestId: string): string => {
    const mt = microTests.find((m) => m.id === microTestId);
    return mt?.displayName ?? "Unknown step";
  };

  return (
    <div className="composition-editor">
      <div className="composition-editor__header">
        <button
          onClick={() => setExpanded(!expanded)}
          className="composition-editor__toggle"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            className={`composition-editor__chevron ${expanded ? "composition-editor__chevron--open" : ""}`}
          >
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="composition-editor__title">
            {composition.name || "Untitled Composition"}
          </span>
        </button>
        <button onClick={onRemove} className="composition-editor__remove">
          Remove
        </button>
      </div>

      {expanded && (
        <div className="composition-editor__body">
          <div className="composition-editor__meta">
            <input
              type="text"
              value={composition.name}
              onChange={(e) => onChange({ ...composition, name: e.target.value })}
              placeholder="Composition name"
              className="input input--compact"
              style={{ flex: 1 }}
            />
            <input
              type="text"
              value={composition.startPath}
              onChange={(e) => onChange({ ...composition, startPath: e.target.value })}
              placeholder="/"
              className="input input--compact input--auto input--code"
              style={{ width: 120 }}
            />
          </div>

          {composition.steps.length === 0 ? (
            <p className="composition-editor__empty">
              Add steps to this composition.
            </p>
          ) : (
            <div className="composition-editor__steps">
              {composition.steps.map((step, idx) => (
                <div key={step.id} className="comp-step">
                  <span className="comp-step__index">{idx + 1}.</span>

                  <button
                    onClick={() => setEditingMicroTestId(step.microTestId)}
                    className="comp-step__name"
                    title="Click to edit script"
                  >
                    {getMicroTestName(step.microTestId)}
                  </button>

                  <button
                    onClick={() => updateStep(step.id, { captureScreenshot: !step.captureScreenshot })}
                    className={`comp-step__camera ${step.captureScreenshot ? "" : "comp-step__camera--disabled"}`}
                    title={step.captureScreenshot ? "Screenshot enabled" : "Screenshot disabled"}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </button>

                  <div className="comp-step__reorder">
                    <button
                      onClick={() => moveStep(idx, -1)}
                      disabled={idx === 0}
                      className="comp-step__reorder-btn"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M18 15l-6-6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveStep(idx, 1)}
                      disabled={idx === composition.steps.length - 1}
                      className="comp-step__reorder-btn"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>

                  <button onClick={() => removeStep(step.id)} className="comp-step__remove">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {showAddStep ? (
            <div className="composition-editor__add-panel">
              <p className="composition-editor__add-hint">
                Choose a micro-test from the library or create a new one:
              </p>
              {microTests.length > 0 && (
                <div className="composition-editor__add-list">
                  {microTests
                    .filter((mt) => !composition.steps.some((s) => s.microTestId === mt.id))
                    .map((mt) => (
                      <button
                        key={mt.id}
                        onClick={() => addStep(mt.id)}
                        className="flow-chip"
                      >
                        {mt.displayName}
                      </button>
                    ))}
                </div>
              )}
              <div className="composition-editor__add-actions">
                <button onClick={createAndAddMicroTest} className="flow-chip">
                  + New micro-test
                </button>
                <button onClick={() => setShowAddStep(false)} className="composition-editor__add-btn">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddStep(true)}
              className="composition-editor__add-btn"
            >
              + Add Step
            </button>
          )}
        </div>
      )}
    </div>
  );
}
