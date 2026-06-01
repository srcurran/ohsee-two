"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MaterialField from "@/components/utility/MaterialField";
import ScriptStepEditor from "@/components/settings/ScriptStepEditor";
import BreakpointEditor from "@/components/settings/BreakpointEditor";
import Wizard from "@/components/settings/Wizard";
import { CredentialsSection } from "@/components/settings/TestSettingsCredentials";
import { Icon } from "@/components/utility/Icon";
import { useSidebar } from "@/components/utility/SidebarProvider";
import { resolveProjectPath } from "@/lib/url-utils";
import { trackReportCompletion } from "@/lib/electron";
import { resolveScriptCredentials } from "@/lib/vault-resolve";
import { BREAKPOINTS, BUILT_IN_VARIANTS } from "@/lib/constants";
import type { Project, SiteTest, TestStep, TestCredentials } from "@/lib/types";

interface Props {
  projectId: string;
  /** Optional pre-filled name (project→test handoff). */
  initialName?: string;
  /** When provided, resume an in-progress draft instead of creating a new
   *  test — hydrates from the stored test and starts at the details step. */
  testId?: string;
  onClose: () => void;
}

type WizardStep = 1 | 2 | 3;
const TOTAL_STEPS = 3;
type TestType = "simple" | "advanced";

/**
 * Three-step new-test flow with incremental save. The test record is created
 * the moment a name is entered (Step 1), so it shows up as a tab immediately
 * and every later action persists onto it:
 *   1. Name              — POSTs the test (simple + draft) and reveals it.
 *   2. Details           — breakpoints + dark/light variants (saved on change).
 *   3. Screens decision  — pick Simple (URL paths) or Advanced (Playwright
 *                          scripts + auth). Finishing clears the draft flag.
 *
 * Saving is incremental, so closing mid-wizard leaves a usable draft; the
 * test page surfaces a "Finish creating test" CTA to resume here.
 */
export default function NewTestWizard({ projectId, initialName, testId, onClose }: Props) {
  const router = useRouter();
  const { refreshProjects } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);

  // The persisted test id. Set after Step 1's POST, or seeded from `testId`
  // when resuming a draft. Mirrored into a ref so the stable persist()
  // closure always sees the latest id.
  const [savedTestId, setSavedTestId] = useState<string | null>(testId ?? null);
  const savedTestIdRef = useRef<string | null>(testId ?? null);
  const setTestId = (id: string) => {
    savedTestIdRef.current = id;
    setSavedTestId(id);
  };

  const [step, setStep] = useState<WizardStep>(testId ? 2 : 1);
  const [name, setName] = useState(initialName ?? "");

  // Step 3: chosen test type (null = show the simple/advanced fork).
  const [chosenType, setChosenType] = useState<TestType | null>(null);

  // Editing state, hydrated from the draft on resume.
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [breakpoints, setBreakpoints] = useState<number[]>([...BREAKPOINTS]);
  const [variantIds, setVariantIds] = useState<string[]>([]);
  const [credentials, setCredentials] = useState<TestCredentials | undefined>(undefined);

  // Simple-path adder
  const [pathInput, setPathInput] = useState("");
  const pathRef = useRef<HTMLInputElement>(null);
  // Advanced script editor swap
  const [scriptEditorOpen, setScriptEditorOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // Load the project (URLs for path resolution) and, when resuming, hydrate
  // the in-progress draft into local state.
  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p);
        if (!testId) return;
        const t = p.tests?.find((x) => x.id === testId);
        if (!t) return;
        setName(t.name);
        setSteps(t.steps ?? []);
        if (t.breakpoints?.length) setBreakpoints(t.breakpoints);
        setVariantIds((t.variants ?? []).map((v) => v.id));
        setCredentials(t.credentials);
        setChosenType(t.testType ?? "simple");
      });
  }, [projectId, testId]);

  const projectUrls = project ? [project.prodUrl, project.devUrl] : [];
  const pathResolved = pathInput.trim() ? resolveProjectPath(pathInput, projectUrls) : null;

  /** Merge a patch onto the saved test. Re-reads the project first so we
   *  never clobber sibling tests created in parallel. */
  const persist = useCallback(
    async (patch: Partial<SiteTest>) => {
      const id = savedTestIdRef.current;
      if (!id) return;
      const latest: Project = await fetch(`/api/projects/${projectId}`).then((r) => r.json());
      const tests = (latest.tests || []).map((t) =>
        t.id === id ? { ...t, ...patch } : t,
      );
      await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tests }),
      });
    },
    [projectId],
  );

  // ── Step 1 → create the test ───────────────────────────────────────────
  const handleCreate = async () => {
    if (savedTestId) {
      // Already created (e.g. user stepped back); just advance.
      setStep(2);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Untitled test", testType: "simple", draft: true }),
      });
      if (!res.ok) return;
      const test: SiteTest = await res.json();
      setTestId(test.id);
      refreshProjects();
      setStep(2);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step 2 actions (save on change) ────────────────────────────────────
  const handleBreakpoints = (bps: number[]) => {
    setBreakpoints(bps);
    persist({ breakpoints: bps });
  };
  const toggleVariant = (id: string, checked: boolean) => {
    const next = checked ? [...variantIds, id] : variantIds.filter((v) => v !== id);
    setVariantIds(next);
    persist({ variants: BUILT_IN_VARIANTS.filter((v) => next.includes(v.id)) });
  };

  // ── Step 3 type choice ─────────────────────────────────────────────────
  const chooseType = (type: TestType) => {
    setChosenType(type);
    persist({ testType: type });
  };

  // ── Step editing (save on change) ──────────────────────────────────────
  const commitSteps = (next: TestStep[]) => {
    setSteps(next);
    persist({ steps: next });
  };
  const addPath = () => {
    if (!pathResolved?.ok) return;
    commitSteps([
      ...steps,
      { id: crypto.randomUUID(), type: "url", url: pathResolved.path, captureScreenshot: true },
    ]);
    setPathInput("");
    // Keep focus on the field so multiple paths can be added rapidly.
    requestAnimationFrame(() => pathRef.current?.focus());
  };
  const addScript = (scriptName: string, script: string) => {
    commitSteps([
      ...steps,
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
    commitSteps(steps.filter((s) => s.id !== id));
  };

  // ── Finish: Save (close to test page) or Run (kick off a report) ───────
  const finish = async (run: boolean) => {
    if (!savedTestId) return;
    setSubmitting(true);
    try {
      await persist({
        draft: false,
        testType: chosenType ?? "simple",
        steps,
        breakpoints,
        variants: BUILT_IN_VARIANTS.filter((v) => variantIds.includes(v.id)),
        credentials,
      });
      refreshProjects();

      if (!run) {
        onClose();
        router.push(`/projects/${projectId}/tests/${savedTestId}`);
        return;
      }

      // Resolve vault credentials for $EMAIL$ / $PASSWORD$ / $OTP$.
      const latest: Project = await fetch(`/api/projects/${projectId}`).then((r) => r.json());
      const savedTest = latest.tests?.find((t) => t.id === savedTestId);
      const scriptCreds = savedTest ? await resolveScriptCredentials(savedTest) : null;
      const runOpts: RequestInit = { method: "POST" };
      if (scriptCreds) {
        runOpts.headers = { "Content-Type": "application/json" };
        runOpts.body = JSON.stringify({ scriptCredentials: scriptCreds });
      }
      const runRes = await fetch(
        `/api/projects/${projectId}/tests/${savedTestId}/reports`,
        runOpts,
      );
      if (runRes.ok) {
        const { reportId } = await runRes.json();
        trackReportCompletion(reportId, name || "Test");
        onClose();
        router.push(`/reports/${reportId}`);
      } else {
        // Couldn't start — drop the user on the test page to retry.
        onClose();
        router.push(`/projects/${projectId}/tests/${savedTestId}`);
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
        busy={submitting}
        onNext={handleCreate}
        onClose={onClose}
      >
        <MaterialField
          label="What should this test be called?"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) handleCreate();
          }}
          placeholder="Marketing pages"
          autoFocus
        />
      </Wizard>
    );
  }

  // ── Step 2: Details (breakpoints + variants) ───────────────────────────
  if (step === 2) {
    return (
      <Wizard
        title="New test"
        step={2}
        totalSteps={TOTAL_STEPS}
        nextLabel="Next"
        onPrev={() => setStep(1)}
        onNext={() => setStep(3)}
        onClose={onClose}
      >
        <div className="wizard__fields">
          <h3 className="wizard__section-title">Screen sizes &amp; modes</h3>
          <BreakpointEditor breakpoints={breakpoints} onChange={handleBreakpoints} />
          <div className="wizard__variants">
            <p className="wizard__variants-label">Variants</p>
            <div className="variant-list">
              {BUILT_IN_VARIANTS.map((v) => (
                <label key={v.id} className="variant-option">
                  <input
                    type="checkbox"
                    checked={variantIds.includes(v.id)}
                    onChange={(e) => toggleVariant(v.id, e.target.checked)}
                    className="checkbox"
                  />
                  {v.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </Wizard>
    );
  }

  // ── Step 3: Screens decision tree ──────────────────────────────────────
  // 3 (fork): pick Simple or Advanced.
  if (chosenType === null) {
    return (
      <Wizard
        title="New test"
        step={3}
        totalSteps={TOTAL_STEPS}
        hideNext
        onPrev={() => setStep(2)}
        onNext={() => {}}
        onClose={onClose}
      >
        <div className="wizard__fields">
          <h3 className="wizard__section-title">How should this test capture screens?</h3>
          <div className="type-fork">
            <button type="button" className="type-fork__card" onClick={() => chooseType("simple")}>
              <Icon name="globe" size={24} />
              <span className="type-fork__title">Simple</span>
              <span className="type-fork__desc">
                A list of URL paths compared against your prod and dev sites.
                Best for marketing pages and other non-linear content.
              </span>
            </button>
            <button type="button" className="type-fork__card" onClick={() => chooseType("advanced")}>
              <Icon name="playwright" size={24} />
              <span className="type-fork__title">Advanced</span>
              <span className="type-fork__desc">
                Playwright scripts for flows, interactions, and authenticated
                pages. Record a session or write a script.
              </span>
            </button>
          </div>
        </div>
      </Wizard>
    );
  }

  // 3a / 3b (editor): footer is Back / Save / Run.
  const hasTemplateVars = steps.some(
    (s) => s.type === "microtest" && s.script && /\$(EMAIL|PASSWORD|OTP)\$/.test(s.script),
  );

  // Advanced: script editor swap.
  if (chosenType === "advanced" && scriptEditorOpen) {
    return (
      <Wizard
        title="New test"
        step={3}
        totalSteps={TOTAL_STEPS}
        hideNext
        onPrev={() => setScriptEditorOpen(false)}
        onNext={() => {}}
        onClose={onClose}
      >
        <ScriptStepEditor
          editing={null}
          onSave={addScript}
          onCancel={() => setScriptEditorOpen(false)}
          primaryLabel="Add step"
          defaultUrl={projectUrls[0]}
        />
      </Wizard>
    );
  }

  return (
    <Wizard
      title="New test"
      step={3}
      totalSteps={TOTAL_STEPS}
      secondaryLabel="Save"
      onSecondary={() => finish(false)}
      nextLabel="Run test"
      nextDisabled={steps.length === 0}
      busy={submitting}
      onPrev={() => setChosenType(null)}
      onNext={() => finish(true)}
      onClose={onClose}
    >
      <div className="wizard__fields">
        <h3 className="wizard__section-title">
          {chosenType === "simple" ? "URL paths" : "Playwright steps"}
        </h3>

        {steps.length === 0 ? (
          <p className="wizard__hint">
            {chosenType === "simple"
              ? "Add the paths you want to capture (e.g. /, /pricing)."
              : "Add a Playwright script to navigate the app before capturing."}
          </p>
        ) : (
          <ul className="wizard__step-list">
            {steps.map((s) => (
              <li key={s.id} className="wizard__step-item">
                <span className="wizard__step-label">
                  {s.type === "url" ? s.url : s.name || "Playwright step"}
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

        {chosenType === "simple" ? (
          <div className="wizard__add-row">
            <MaterialField
              ref={pathRef}
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
        ) : (
          <>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setScriptEditorOpen(true)}
            >
              Add Playwright script
            </button>
            <CredentialsSection
              credentials={credentials}
              onChange={(next) => {
                setCredentials(next);
                persist({ credentials: next });
              }}
              hasTemplateVars={hasTemplateVars}
            />
          </>
        )}
      </div>
    </Wizard>
  );
}
