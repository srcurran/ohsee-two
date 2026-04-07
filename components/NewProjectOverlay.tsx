"use client";

import { useState } from "react";
import { BUILT_IN_VARIANTS } from "@/lib/constants";
import FlowRecorderModal from "@/components/FlowRecorderModal";
import type { FlowEntry, FlowAction } from "@/lib/types";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

const ACTION_TYPES = ["click", "fill", "wait", "waitForSelector", "navigate", "screenshot"] as const;

function newStep(type: FlowAction["type"]): FlowAction {
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
    case "screenshot":
      return { id, type: "screenshot", label: "" };
  }
}

export default function NewProjectOverlay({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1: basics
  const [prodUrl, setProdUrl] = useState("");
  const [devUrl, setDevUrl] = useState("");
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);

  // Step 2: pages & flows
  const [activeTab, setActiveTab] = useState<"pages" | "flows">("pages");
  const [paths, setPaths] = useState<string[]>(["/"]);
  const [newPath, setNewPath] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [flows, setFlows] = useState<FlowEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleCrawl = async () => {
    if (!prodUrl) return;
    setCrawling(true);
    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: prodUrl }),
      });
      if (res.ok) {
        const { paths: discovered } = await res.json();
        setPaths(discovered);
      }
    } catch {
      // ignore
    } finally {
      setCrawling(false);
    }
  };

  const handleAddPath = () => {
    const p = newPath.trim();
    if (p && !paths.includes(p)) {
      setPaths([...paths, p.startsWith("/") ? p : `/${p}`]);
      setNewPath("");
    }
  };

  const handleRemovePath = (path: string) => {
    setPaths(paths.filter((p) => p !== path));
  };

  const addFlow = () => {
    setFlows([
      ...flows,
      {
        id: crypto.randomUUID(),
        name: "",
        startPath: "/",
        steps: [newStep("screenshot")],
      },
    ]);
  };

  const updateFlow = (idx: number, updated: FlowEntry) => {
    const next = [...flows];
    next[idx] = updated;
    setFlows(next);
  };

  const removeFlow = (idx: number) => {
    setFlows(flows.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!prodUrl || !devUrl) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prodUrl: prodUrl.replace(/\/$/, ""),
          devUrl: devUrl.replace(/\/$/, ""),
          requiresAuth,
          variants: BUILT_IN_VARIANTS.filter((v) => selectedVariants.includes(v.id)),
          pages: paths.map((p) => ({ path: p })),
          ...(flows.length > 0 ? { flows } : {}),
        }),
      });
      if (res.ok) {
        onCreated();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canAdvance = prodUrl.trim() !== "" && devUrl.trim() !== "";
  const canSubmit = paths.length > 0 || flows.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[600px] rounded-[12px] bg-surface-content p-[32px]">
        {/* Header with step indicator */}
        <div className="mb-[24px] flex items-center justify-between">
          <h2 className="text-[24px] font-bold text-foreground">New Project</h2>
          <div className="flex items-center gap-[8px]">
            <span
              className={`flex h-[24px] w-[24px] items-center justify-center rounded-full text-[12px] font-bold ${
                step === 1
                  ? "bg-foreground text-surface-content"
                  : "bg-surface-tertiary text-text-muted"
              }`}
            >
              1
            </span>
            <span className="h-[1px] w-[16px] bg-border-primary" />
            <span
              className={`flex h-[24px] w-[24px] items-center justify-center rounded-full text-[12px] font-bold ${
                step === 2
                  ? "bg-foreground text-surface-content"
                  : "bg-surface-tertiary text-text-muted"
              }`}
            >
              2
            </span>
          </div>
        </div>

        {/* Step 1: Basics */}
        {step === 1 && (
          <>
            <div className="mb-[16px]">
              <label className="mb-[4px] block text-[14px] text-foreground">Production URL</label>
              <input
                type="text"
                value={prodUrl}
                onChange={(e) => setProdUrl(e.target.value)}
                placeholder="https://www.example.com"
                className="w-full rounded-[8px] border border-border-primary px-[12px] py-[10px] text-[14px] text-foreground outline-none focus:border-foreground"
              />
            </div>

            <div className="mb-[24px]">
              <label className="mb-[4px] block text-[14px] text-foreground">Development URL</label>
              <input
                type="text"
                value={devUrl}
                onChange={(e) => setDevUrl(e.target.value)}
                placeholder="https://staging.example.com"
                className="w-full rounded-[8px] border border-border-primary px-[12px] py-[10px] text-[14px] text-foreground outline-none focus:border-foreground"
              />
            </div>

            <div className="mb-[24px] flex flex-col gap-[12px]">
              <label className="flex items-center gap-[8px] text-[14px] text-foreground">
                <input
                  type="checkbox"
                  checked={requiresAuth}
                  onChange={(e) => setRequiresAuth(e.target.checked)}
                  className="h-[16px] w-[16px]"
                />
                Requires authentication (for localhost testing)
              </label>
              <div>
                <p className="mb-[6px] text-[13px] text-text-muted">Test variants</p>
                <div className="flex gap-[16px]">
                  {BUILT_IN_VARIANTS.map((v) => (
                    <label key={v.id} className="flex items-center gap-[6px] text-[14px] text-foreground">
                      <input
                        type="checkbox"
                        checked={selectedVariants.includes(v.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedVariants([...selectedVariants, v.id]);
                          } else {
                            setSelectedVariants(selectedVariants.filter((id) => id !== v.id));
                          }
                        }}
                        className="h-[16px] w-[16px]"
                      />
                      {v.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-[12px]">
              <button
                onClick={onClose}
                className="rounded-[12px] px-[24px] py-[10px] text-[16px] text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!canAdvance}
                className="rounded-[12px] bg-foreground px-[32px] py-[10px] text-[16px] font-bold text-surface-content transition-all hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </>
        )}

        {/* Step 2: Pages & Flows */}
        {step === 2 && (
          <>
            {/* Tab switcher */}
            <div className="mb-[20px] flex gap-[4px] rounded-[8px] bg-surface-tertiary p-[4px]">
              <button
                onClick={() => setActiveTab("pages")}
                className={`flex-1 rounded-[6px] px-[16px] py-[8px] text-[14px] font-bold transition-colors ${
                  activeTab === "pages"
                    ? "bg-surface-content text-foreground shadow-elevation-sm"
                    : "text-text-muted hover:text-foreground"
                }`}
              >
                Pages
              </button>
              <button
                onClick={() => setActiveTab("flows")}
                className={`flex-1 rounded-[6px] px-[16px] py-[8px] text-[14px] font-bold transition-colors ${
                  activeTab === "flows"
                    ? "bg-surface-content text-foreground shadow-elevation-sm"
                    : "text-text-muted hover:text-foreground"
                }`}
              >
                Flows
                {flows.length > 0 && (
                  <span className="ml-[6px] rounded-full bg-accent-primary/20 px-[6px] py-[1px] text-[11px] text-accent-primary">
                    {flows.length}
                  </span>
                )}
              </button>
            </div>

            {/* Pages tab */}
            {activeTab === "pages" && (
              <div className="mb-[24px]">
                <div className="mb-[8px] flex items-center justify-between">
                  <p className="text-[13px] text-text-muted">URL paths to capture during each scan.</p>
                  <button
                    onClick={handleCrawl}
                    disabled={!prodUrl || crawling}
                    className="text-[12px] text-foreground underline disabled:opacity-50"
                  >
                    {crawling ? "Crawling..." : "Discover from sitemap"}
                  </button>
                </div>

                <div className="mb-[8px] flex gap-[8px]">
                  <input
                    type="text"
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddPath()}
                    placeholder="/about"
                    className="flex-1 rounded-[8px] border border-border-primary px-[12px] py-[8px] text-[14px] text-foreground outline-none focus:border-foreground"
                  />
                  <button
                    onClick={handleAddPath}
                    className="rounded-[8px] bg-surface-tertiary px-[16px] py-[8px] text-[14px] text-foreground transition-all hover:shadow-elevation-sm"
                  >
                    Add
                  </button>
                </div>

                <div className="max-h-[200px] overflow-y-auto">
                  {paths.map((p) => (
                    <div
                      key={p}
                      className="flex items-center justify-between border-b border-border-primary py-[6px] text-[14px] text-foreground"
                    >
                      <span>{p}</span>
                      <button
                        onClick={() => handleRemovePath(p)}
                        className="text-[12px] text-text-muted hover:text-foreground"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {paths.length === 0 && (
                    <p className="py-[12px] text-center text-[13px] text-text-muted">
                      No pages added yet.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Flows tab */}
            {activeTab === "flows" && (
              <div className="mb-[24px]">
                <p className="mb-[12px] text-[13px] text-text-muted">
                  Script browser interactions to test multi-step flows like onboarding, checkout, etc.
                </p>

                <div className="max-h-[300px] space-y-[8px] overflow-y-auto">
                  {flows.map((flow, idx) => (
                    <FlowMiniEditor
                      key={flow.id}
                      flow={flow}
                      onChange={(updated) => updateFlow(idx, updated)}
                      onRemove={() => removeFlow(idx)}
                    />
                  ))}
                </div>

                <button
                  onClick={addFlow}
                  className="mt-[8px] rounded-[8px] bg-surface-tertiary px-[16px] py-[8px] text-[14px] text-foreground transition-colors hover:bg-foreground/10"
                >
                  + Add Flow
                </button>
              </div>
            )}

            <div className="flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="rounded-[12px] px-[24px] py-[10px] text-[16px] text-text-muted transition-colors hover:text-foreground"
              >
                Back
              </button>
              <div className="flex gap-[12px]">
                <button
                  onClick={onClose}
                  className="rounded-[12px] px-[24px] py-[10px] text-[16px] text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit || submitting}
                  className="rounded-[12px] bg-accent-primary px-[40px] py-[10px] text-[16px] font-bold text-foreground transition-all hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50"
                >
                  {submitting ? "Creating..." : "Create Project"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Compact flow editor for the creation wizard                        */
/* ------------------------------------------------------------------ */

function FlowMiniEditor({
  flow,
  onChange,
  onRemove,
}: {
  flow: FlowEntry;
  onChange: (updated: FlowEntry) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showRecorder, setShowRecorder] = useState(false);

  const addStep = (type: FlowAction["type"]) => {
    onChange({ ...flow, steps: [...flow.steps, newStep(type)] });
  };

  const updateStep = (idx: number, updated: FlowAction) => {
    const steps = [...flow.steps];
    steps[idx] = updated;
    onChange({ ...flow, steps });
  };

  const removeStep = (idx: number) => {
    onChange({ ...flow, steps: flow.steps.filter((_, i) => i !== idx) });
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= flow.steps.length) return;
    const steps = [...flow.steps];
    [steps[idx], steps[target]] = [steps[target], steps[idx]];
    onChange({ ...flow, steps });
  };

  return (
    <div className="rounded-[8px] border border-border-primary p-[12px]">
      <div className="mb-[8px] flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-[6px] text-[14px] font-bold text-foreground"
        >
          <span className="text-[10px] text-text-muted">{expanded ? "\u25BC" : "\u25B6"}</span>
          {flow.name || "Untitled Flow"}
        </button>
        <button
          onClick={onRemove}
          className="text-[11px] text-text-muted hover:text-foreground"
        >
          Remove
        </button>
      </div>

      {expanded && (
        <>
          <div className="mb-[8px] flex gap-[6px]">
            <input
              type="text"
              value={flow.name}
              onChange={(e) => onChange({ ...flow, name: e.target.value })}
              placeholder="Flow name"
              className="flex-1 rounded-[6px] border border-border-primary bg-transparent px-[8px] py-[6px] text-[13px] text-foreground outline-none placeholder:text-text-muted focus:border-foreground"
            />
            <input
              type="text"
              value={flow.startPath}
              onChange={(e) => onChange({ ...flow, startPath: e.target.value })}
              placeholder="/start-path"
              className="w-[140px] rounded-[6px] border border-border-primary bg-transparent px-[8px] py-[6px] text-[13px] text-foreground outline-none placeholder:text-text-muted focus:border-foreground"
            />
          </div>

          {/* Steps */}
          <div className="mb-[6px] space-y-[4px]">
            {flow.steps.map((s, idx) => (
              <div
                key={s.id}
                className="flex items-center gap-[4px] rounded-[4px] bg-surface-secondary px-[6px] py-[4px]"
              >
                <div className="flex flex-col text-[8px] text-text-muted">
                  <button onClick={() => moveStep(idx, -1)} className="hover:text-foreground">{"\u25B2"}</button>
                  <button onClick={() => moveStep(idx, 1)} className="hover:text-foreground">{"\u25BC"}</button>
                </div>
                <span className="rounded-[3px] bg-surface-tertiary px-[4px] py-[1px] text-[10px] font-bold text-text-muted">
                  {s.type}
                </span>
                <div className="flex flex-1 gap-[4px]">
                  <StepFields step={s} onChange={(updated) => updateStep(idx, updated)} />
                </div>
                <button
                  onClick={() => removeStep(idx)}
                  className="text-[10px] text-text-muted hover:text-foreground"
                >
                  x
                </button>
              </div>
            ))}
          </div>

          {/* Add step */}
          <div className="flex flex-wrap items-center gap-[3px]">
            {ACTION_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => addStep(type)}
                className="rounded-[4px] bg-surface-tertiary px-[6px] py-[2px] text-[10px] text-text-muted hover:bg-foreground/10 hover:text-foreground"
              >
                + {type}
              </button>
            ))}
            <span className="mx-[2px] text-[10px] text-text-muted">or</span>
            <button
              onClick={() => setShowRecorder(true)}
              className="rounded-[4px] bg-accent-primary/10 px-[6px] py-[2px] text-[10px] font-bold text-accent-primary hover:bg-accent-primary/20"
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

function StepFields({
  step,
  onChange,
}: {
  step: FlowAction;
  onChange: (s: FlowAction) => void;
}) {
  const inputClass =
    "flex-1 rounded-[4px] border border-border-primary bg-transparent px-[6px] py-[3px] text-[12px] text-foreground outline-none placeholder:text-text-muted focus:border-foreground";

  switch (step.type) {
    case "click":
      return (
        <input
          type="text"
          value={step.selector}
          onChange={(e) => onChange({ ...step, selector: e.target.value })}
          placeholder='selector, e.g. button:has-text("Next")'
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
            placeholder="selector"
            className={inputClass}
          />
          <input
            type="text"
            value={step.value}
            onChange={(e) => onChange({ ...step, value: e.target.value })}
            placeholder="value"
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
          className={`${inputClass} w-[80px]`}
        />
      );
    case "waitForSelector":
      return (
        <input
          type="text"
          value={step.selector}
          onChange={(e) => onChange({ ...step, selector: e.target.value })}
          placeholder="selector to wait for"
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
