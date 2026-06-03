"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Field from "@/components/utility/Field";
import ScriptEditor from "@/components/settings/shared/ScriptEditor";
import AuthProfileSelect from "@/components/settings/shared/AuthProfileSelect";
import AuthProfilesPanel from "@/components/settings/shared/AuthProfilesPanel";
import BreakpointEditor from "@/components/settings/shared/BreakpointEditor";
import Wizard from "@/components/settings/shared/Wizard";
import { Icon } from "@/components/utility/Icon";
import { useSidebar } from "@/components/utility/SidebarProvider";
import { resolveProjectPath } from "@/lib/url-utils";
import { trackReportCompletion } from "@/lib/electron";
import { resolveScriptCredentials } from "@/lib/vault-resolve";
import { BREAKPOINTS, BUILT_IN_VARIANTS } from "@/lib/constants";
import type { Project, SiteTest, TestStep, UserSettings } from "@/lib/types";

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
  // Sign-in profiles manager, shown in-place (back button) from the advanced
  // editor's profile picker rather than stacking another overlay.
  const [authView, setAuthView] = useState(false);

  // Editing state, hydrated from the draft on resume.
  const [steps, setSteps] = useState<TestStep[]>([]); // simple: url steps
  const [script, setScript] = useState(""); // advanced: one Playwright script
  const [breakpoints, setBreakpoints] = useState<number[]>([...BREAKPOINTS]);
  const [variantIds, setVariantIds] = useState<string[]>([]);
  const [authProfileId, setAuthProfileId] = useState<string | undefined>(undefined);

  // Simple-path adder
  const [pathInput, setPathInput] = useState("");
  const pathRef = useRef<HTMLInputElement>(null);

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
        setScript(t.script ?? "");
        if (t.breakpoints?.length) setBreakpoints(t.breakpoints);
        setVariantIds((t.variants ?? []).map((v) => v.id));
        setAuthProfileId(t.authProfileId);
        setChosenType(t.testType ?? "simple");
      });
  }, [projectId, testId]);

  // Seed breakpoints + variants from the user's defaults for a brand-new
  // test (skip when resuming a draft — that hydrates from the test above).
  useEffect(() => {
    if (testId) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: UserSettings) => {
        if (s.defaultBreakpoints?.length) setBreakpoints(s.defaultBreakpoints);
        if (s.defaultVariants) setVariantIds(s.defaultVariants);
      })
      .catch(() => {});
  }, [testId]);

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

  // Debounced autosave for the advanced script editor — so closing the
  // wizard never loses script edits.
  const scriptSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleScriptChange = (next: string) => {
    setScript(next);
    if (scriptSaveTimer.current) clearTimeout(scriptSaveTimer.current);
    scriptSaveTimer.current = setTimeout(() => { persist({ script: next }); }, 600);
  };
  useEffect(
    () => () => { if (scriptSaveTimer.current) clearTimeout(scriptSaveTimer.current); },
    [],
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
  const removeStep = (id: string) => {
    commitSteps(steps.filter((s) => s.id !== id));
  };

  // ── Finish: Save (close to test page) or Run (kick off a report) ───────
  const finish = async (run: boolean) => {
    if (!savedTestId) return;
    setSubmitting(true);
    try {
      const type = chosenType ?? "simple";
      await persist({
        draft: false,
        testType: type,
        // Advanced is a single script; simple is URL steps. Clear the other
        // shape so the test has one source of truth.
        ...(type === "advanced"
          ? { script, steps: [], authProfileId }
          : { steps, script: "" }),
        breakpoints,
        variants: BUILT_IN_VARIANTS.filter((v) => variantIds.includes(v.id)),
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
        <Field
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
        <div className="wizard__fields stack stack--lg">
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
        <div className="wizard__fields stack stack--lg">
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

  // Sign-in profiles manager (reached from the advanced profile picker).
  if (authView) {
    return (
      <Wizard
        title="New test"
        step={3}
        totalSteps={TOTAL_STEPS}
        hideNext
        onPrev={() => setAuthView(false)}
        onNext={() => {}}
        onClose={onClose}
      >
        <AuthProfilesPanel projectId={projectId} />
      </Wizard>
    );
  }

  // 3a / 3b (editor): footer is Back / Save / Run.
  return (
    <Wizard
      title="New test"
      step={3}
      totalSteps={TOTAL_STEPS}
      secondaryLabel="Save"
      onSecondary={() => finish(false)}
      nextLabel="Run test"
      nextDisabled={chosenType === "advanced" ? !script.trim() : steps.length === 0}
      busy={submitting}
      onPrev={() => setChosenType(null)}
      onNext={() => finish(true)}
      onClose={onClose}
    >
      {chosenType === "simple" ? (
        <div className="wizard__fields stack stack--lg">
          {steps.length === 0 ? (
            <p className="wizard__hint">
              Add the paths you want to capture (e.g. /, /pricing).
            </p>
          ) : (
            <ul className="wizard__step-list">
              {steps.map((s) => (
                <li key={s.id} className="wizard__step-item">
                  <span className="wizard__step-label">{s.url}</span>
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
          <div className="wizard__add-row row row--top">
            <Field
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
        </div>
      ) : (
        <div className="wizard__fields stack stack--lg">
          <ScriptEditor value={script} onChange={handleScriptChange} defaultUrl={projectUrls[0]} />
          <AuthProfileSelect
            profiles={project?.authProfiles ?? []}
            value={authProfileId}
            onChange={(id) => {
              setAuthProfileId(id);
              persist({ authProfileId: id });
            }}
            onManage={() => setAuthView(true)}
          />
        </div>
      )}
    </Wizard>
  );
}
