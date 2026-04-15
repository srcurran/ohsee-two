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

  // If editing a micro-test, show the code editor
  if (editingMicroTest) {
    return (
      <div className="rounded-[8px] border border-border-primary p-[16px]">
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
    <div className="rounded-[8px] border border-border-primary">
      {/* Header */}
      <div className="flex items-center justify-between p-[12px]">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-[8px] text-left"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            className={`transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[14px] font-bold text-foreground">
            {composition.name || "Untitled Composition"}
          </span>
        </button>
        <button
          onClick={onRemove}
          className="text-[12px] text-text-muted transition-colors hover:text-status-error"
        >
          Remove
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border-primary p-[12px]">
          {/* Name + start path */}
          <div className="mb-[16px] flex gap-[12px]">
            <input
              type="text"
              value={composition.name}
              onChange={(e) => onChange({ ...composition, name: e.target.value })}
              placeholder="Composition name"
              className="flex-1 rounded-[8px] border border-border-primary bg-transparent px-[12px] py-[8px] text-[14px] text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-foreground"
            />
            <input
              type="text"
              value={composition.startPath}
              onChange={(e) => onChange({ ...composition, startPath: e.target.value })}
              placeholder="/"
              className="w-[120px] rounded-[8px] border border-border-primary bg-transparent px-[12px] py-[8px] text-[14px] text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-foreground font-mono"
            />
          </div>

          {/* Steps list */}
          {composition.steps.length === 0 ? (
            <p className="mb-[12px] text-center text-[13px] text-text-muted py-[12px]">
              Add steps to this composition.
            </p>
          ) : (
            <div className="mb-[12px] space-y-[4px]">
              {composition.steps.map((step, idx) => (
                <div
                  key={step.id}
                  className="flex items-center gap-[8px] rounded-[4px] bg-surface-tertiary/50 px-[12px] py-[8px]"
                >
                  {/* Step number */}
                  <span className="shrink-0 text-[12px] text-text-muted w-[20px]">
                    {idx + 1}.
                  </span>

                  {/* Micro-test name (clickable to edit) */}
                  <button
                    onClick={() => setEditingMicroTestId(step.microTestId)}
                    className="flex-1 text-left text-[14px] text-foreground hover:text-accent-blue transition-colors truncate"
                    title="Click to edit script"
                  >
                    {getMicroTestName(step.microTestId)}
                  </button>

                  {/* Screenshot toggle */}
                  <button
                    onClick={() => updateStep(step.id, { captureScreenshot: !step.captureScreenshot })}
                    className={`shrink-0 transition-colors ${
                      step.captureScreenshot ? "text-foreground" : "text-text-muted/40"
                    }`}
                    title={step.captureScreenshot ? "Screenshot enabled" : "Screenshot disabled"}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </button>

                  {/* Reorder */}
                  <div className="flex shrink-0 gap-[2px]">
                    <button
                      onClick={() => moveStep(idx, -1)}
                      disabled={idx === 0}
                      className="text-text-muted transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M18 15l-6-6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveStep(idx, 1)}
                      disabled={idx === composition.steps.length - 1}
                      className="text-text-muted transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeStep(step.id)}
                    className="shrink-0 text-text-muted transition-colors hover:text-status-error"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add step */}
          {showAddStep ? (
            <div className="rounded-[8px] border border-border-primary p-[12px]">
              <p className="mb-[8px] text-[12px] text-text-muted">
                Choose a micro-test from the library or create a new one:
              </p>
              {microTests.length > 0 && (
                <div className="mb-[8px] flex flex-wrap gap-[4px]">
                  {microTests
                    .filter((mt) => !composition.steps.some((s) => s.microTestId === mt.id))
                    .map((mt) => (
                      <button
                        key={mt.id}
                        onClick={() => addStep(mt.id)}
                        className="rounded-[6px] border border-border-primary px-[10px] py-[4px] text-[13px] text-foreground transition-colors hover:bg-surface-tertiary"
                      >
                        {mt.displayName}
                      </button>
                    ))}
                </div>
              )}
              <div className="flex gap-[8px]">
                <button
                  onClick={createAndAddMicroTest}
                  className="rounded-[6px] bg-surface-tertiary px-[12px] py-[4px] text-[13px] text-foreground transition-colors hover:bg-foreground/10"
                >
                  + New micro-test
                </button>
                <button
                  onClick={() => setShowAddStep(false)}
                  className="text-[13px] text-text-muted hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddStep(true)}
              className="text-[13px] text-text-muted transition-colors hover:text-foreground"
            >
              + Add Step
            </button>
          )}
        </div>
      )}
    </div>
  );
}
