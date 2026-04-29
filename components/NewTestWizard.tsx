"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MaterialField from "@/components/MaterialField";
import ScriptStepEditor from "@/components/ScriptStepEditor";
import BreakpointEditor from "@/components/settings/BreakpointEditor";
import Wizard from "@/components/Wizard";
import { useSidebar } from "@/components/SidebarProvider";
import { resolveProjectPath } from "@/lib/url-utils";
import { trackReportCompletion } from "@/lib/electron";
import { BREAKPOINTS, BUILT_IN_VARIANTS } from "@/lib/constants";
import type { Project, SiteTest, TestStep, TestCredentials } from "@/lib/types";

interface Props {
  projectId: string;
  /** Optional — when provided, the wizard skips its own first step (name)
   *  and renders the steps editor directly. Used for the post-create
   *  handoff from NewProjectWizard. */
  initialName?: string;
  onClose: () => void;
}

type WizardStep = 1 | 2 | 3 | 4;
const TOTAL_STEPS = 4;

/**
 * Four-step new-test flow:
 *   1. Name
 *   2. Steps editor — add paths or Playwright scripts. The Playwright path
 *      swaps in the shared ScriptStepEditor.
 *   3. Screen sizes / variants — BreakpointEditor + light/dark/auto checkboxes.
 *   4. Credentials — opt-in session-cookie minting + copy-from-other-test.
 *      Primary action is "Run test" which creates the test, kicks off a
 *      report, and navigates to the new report page.
 */
export default function NewTestWizard({ projectId, initialName, onClose }: Props) {
  const router = useRouter();
  const { refreshProjects, openTestSettings } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);
  const [step, setStep] = useState<WizardStep>(initialName ? 2 : 1);
  const [name, setName] = useState(initialName ?? "");

  // Step 2 state: steps list + inline path adder + script-editor swap
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [pathInput, setPathInput] = useState("");
  const [scriptEditorOpen, setScriptEditorOpen] = useState(false);

  // Step 3 state: breakpoints + variants
  const [breakpoints, setBreakpoints] = useState<number[]>([...BREAKPOINTS]);
  const [variantIds, setVariantIds] = useState<string[]>([]);

  // Step 4 state: credentials
  const [credentials, setCredentials] = useState<TestCredentials | undefined>(undefined);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((p: Project) => setProject(p));
  }, [projectId]);

  const projectUrls = project ? [project.prodUrl, project.devUrl] : [];
  const pathResolved = pathInput.trim() ? resolveProjectPath(pathInput, projectUrls) : null;

  // Other (non-archived) tests we can copy credentials from.
  const otherTests: SiteTest[] = (project?.tests || []).filter((t) => !t.archived);

  const addPath = () => {
    if (!pathResolved?.ok) return;
    setSteps((cur) => [
      ...cur,
      { id: crypto.randomUUID(), type: "url", url: pathResolved.path, captureScreenshot: true },
    ]);
    setPathInput("");
  };

  const addScript = (scriptName: string, script: string) => {
    setSteps((cur) => [
      ...cur,
      {
        id: crypto.randomUUID(),
        type: "microtest",
        name: scriptName.trim() || "Untitled step",
        script,
        captureScreenshot: true,
      },
    ]);
    setScriptEditorOpen(false);
  };

  const removeStep = (id: string) => {
    setSteps((cur) => cur.filter((s) => s.id !== id));
  };

  const handleRunTest = async () => {
    if (!project) return;
    setSubmitting(true);
    try {
      // Create the test.
      const testRes = await fetch(`/api/projects/${projectId}/tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Untitled test" }),
      });
      if (!testRes.ok) return;
      const test = await testRes.json();

      // Persist all wizard state onto the new test via the project PUT.
      // Reload latest first so we don't clobber siblings created in
      // parallel.
      const latest = await fetch(`/api/projects/${projectId}`).then((r) => r.json());
      const patch: Partial<SiteTest> = {
        steps,
        breakpoints,
        variants: BUILT_IN_VARIANTS.filter((v) => variantIds.includes(v.id)),
        credentials,
      };
      const latestTests = (latest.tests || []).map((t: { id: string }) =>
        t.id === test.id ? { ...t, ...patch } : t,
      );
      await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tests: latestTests }),
      });

      refreshProjects();

      // Kick off a run for this specific test.
      const runRes = await fetch(`/api/projects/${projectId}/tests/${test.id}/reports`, {
        method: "POST",
      });
      if (runRes.ok) {
        const { reportId } = await runRes.json();
        trackReportCompletion(reportId, name || "Test");
        onClose();
        router.push(`/reports/${reportId}`);
      } else {
        // Fall back: open the test in settings if the run couldn't start.
        onClose();
        openTestSettings(projectId, test.id);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step 1: Name ───────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <Wizard
        title="New test"
        step={1}
        totalSteps={TOTAL_STEPS}
        nextLabel="Next"
        nextDisabled={!name.trim()}
        onNext={() => setStep(2)}
        onClose={onClose}
      >
        <MaterialField
          label="What should this test be called?"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Onboarding"
          autoFocus
        />
      </Wizard>
    );
  }

  // ── Step 2: Steps editor ───────────────────────────────────────────────
  if (step === 2) {
    if (scriptEditorOpen) {
      return (
        <Wizard
          title="New test"
          step={2}
          totalSteps={TOTAL_STEPS}
          // ScriptStepEditor renders its own primary; suppress wizard's
          // by leaving Next disabled. Footer still shows Previous/step
          // count for orientation.
          nextLabel="Save"
          nextDisabled
          onPrev={() => setScriptEditorOpen(false)}
          onNext={() => {}}
          onClose={onClose}
        >
          <ScriptStepEditor
            editing={null}
            onSave={addScript}
            onCancel={() => setScriptEditorOpen(false)}
            primaryLabel="Add step"
          />
        </Wizard>
      );
    }
    return (
      <Wizard
        title="New test"
        step={2}
        totalSteps={TOTAL_STEPS}
        nextLabel="Next"
        nextDisabled={steps.length === 0}
        onPrev={() => setStep(1)}
        onNext={() => setStep(3)}
        onClose={onClose}
      >
        <div className="wizard__fields">
          <h3 className="wizard__section-title">Test steps</h3>

          {steps.length === 0 ? (
            <p className="wizard__hint">
              Add a path to capture, or write a Playwright script to navigate
              the app before capturing.
            </p>
          ) : (
            <ul className="wizard__step-list">
              {steps.map((s) => (
                <li key={s.id} className="wizard__step-item">
                  <span className="wizard__step-label">
                    {s.type === "url" ? s.url : (s.name || "Playwright step")}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeStep(s.id)}
                    className="btn btn--text"
                    aria-label="Remove"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="wizard__add-row">
            <MaterialField
              label="Path"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="/about"
              status={!pathInput ? "idle" : pathResolved?.ok ? "valid" : "invalid"}
              error={pathResolved && !pathResolved.ok ? pathResolved.error : null}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPath();
                }
              }}
              spellCheck={false}
            />
            <button
              type="button"
              className="btn btn--outline"
              onClick={addPath}
              disabled={!pathResolved?.ok}
            >
              Add path
            </button>
          </div>

          <button
            type="button"
            className="btn btn--outline"
            onClick={() => setScriptEditorOpen(true)}
          >
            Add Playwright script
          </button>
        </div>
      </Wizard>
    );
  }

  // ── Step 3: Screen sizes / variants ────────────────────────────────────
  if (step === 3) {
    return (
      <Wizard
        title="New test"
        step={3}
        totalSteps={TOTAL_STEPS}
        nextLabel="Next"
        onPrev={() => setStep(2)}
        onNext={() => setStep(4)}
        onClose={onClose}
      >
        <div className="wizard__fields">
          <h3 className="wizard__section-title">Screen sizes &amp; modes</h3>
          <BreakpointEditor breakpoints={breakpoints} onChange={setBreakpoints} />
          <div className="wizard__variants">
            <p className="wizard__variants-label">Variants</p>
            <div className="variant-list">
              {BUILT_IN_VARIANTS.map((v) => {
                const active = variantIds.includes(v.id);
                return (
                  <label key={v.id} className="variant-option">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...variantIds, v.id]
                          : variantIds.filter((id) => id !== v.id);
                        setVariantIds(next);
                      }}
                      className="checkbox"
                    />
                    {v.label}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </Wizard>
    );
  }

  // ── Step 4: Credentials + Run test ─────────────────────────────────────
  const credEnabled = credentials?.enabled === true;
  const copyFromId = credentials?.copyFromTestId ?? "";
  return (
    <Wizard
      title="New test"
      step={4}
      totalSteps={TOTAL_STEPS}
      nextLabel="Run test"
      busy={submitting}
      onPrev={() => setStep(3)}
      onNext={handleRunTest}
      onClose={onClose}
    >
      <div className="wizard__fields">
        <h3 className="wizard__section-title">Credentials</h3>

        <label className="credentials-section__row">
          <input
            type="checkbox"
            checked={credEnabled}
            onChange={(e) =>
              setCredentials({ ...credentials, enabled: e.target.checked })
            }
            className="checkbox"
          />
          <span>Mint a session cookie before each capture (require auth)</span>
        </label>

        <div className="credentials-section__row">
          <label className="credentials-section__label">Copy from other settings…</label>
          <select
            className="input input--compact"
            value={copyFromId}
            onChange={(e) =>
              setCredentials({
                ...credentials,
                copyFromTestId: e.target.value || undefined,
              })
            }
            disabled={otherTests.length === 0}
          >
            <option value="">Don&apos;t copy</option>
            {otherTests.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {!credEnabled && !copyFromId && (
          <p className="credentials-section__hint">
            No credentials configured — runs use the project default.
          </p>
        )}
      </div>
    </Wizard>
  );
}
