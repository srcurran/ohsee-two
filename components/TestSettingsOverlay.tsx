"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MaterialField from "@/components/MaterialField";
import BreakpointEditor from "@/components/settings/BreakpointEditor";
import { useSidebar } from "@/components/SidebarProvider";
import { BREAKPOINTS, BUILT_IN_VARIANTS } from "@/lib/constants";
import { getTestSteps } from "@/lib/test-steps";
import { checkUrl } from "@/lib/url-validation";
import type {
  MicroTest,
  Project,
  SiteTest,
  TestStep,
  TestCredentials,
} from "@/lib/types";

const ENTER_MS = 180;
const EXIT_MS = 140;
const SAVE_DEBOUNCE_MS = 600;

type AccordionId = "settings" | "credentials";

interface Props {
  projectId: string;
  testId: string;
  onClose: () => void;
}

export default function TestSettingsOverlay({ projectId, testId, onClose }: Props) {
  const { refreshProjects } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);
  const [animState, setAnimState] = useState<"entering" | "visible" | "exiting">("entering");

  // Local working state — editing happens against these and writes back to
  // the API via debounced PUT. The whole project is loaded so we can update
  // the test in-place while keeping siblings intact.
  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [breakpoints, setBreakpoints] = useState<number[]>([]);
  const [variantIds, setVariantIds] = useState<string[]>([]);
  const [credentials, setCredentials] = useState<TestCredentials | undefined>(undefined);

  // Sub-views: when an step is being added or edited, the overlay body is
  // replaced by AddEditStepView. `null` = step list is shown.
  const [stepEditor, setStepEditor] = useState<
    | { mode: "create" }
    | { mode: "edit"; stepId: string }
    | null
  >(null);

  const [openAccordion, setOpenAccordion] = useState<AccordionId | null>(null);

  const stateRef = useRef({ name, steps, breakpoints, variantIds, credentials });
  stateRef.current = { name, steps, breakpoints, variantIds, credentials };
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mount-in animation
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setAnimState("visible")));
  }, []);

  // Esc closes (unless an editor is open — Esc backs out one level instead)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      if (stepEditor) {
        setStepEditor(null);
      } else {
        handleClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepEditor]);

  // Load project + this test's state
  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((p: Project) => {
        const test = p.tests?.find((t) => t.id === testId);
        if (!test) {
          handleClose();
          return;
        }
        setProject(p);
        setName(test.name);
        setSteps(getTestSteps(test));
        setBreakpoints(test.breakpoints?.length ? test.breakpoints : [...BREAKPOINTS]);
        setVariantIds((test.variants || []).map((v) => v.id));
        setCredentials(test.credentials);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, testId]);

  const handleClose = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      flushSave();
    }
    setAnimState("exiting");
    setTimeout(onClose, EXIT_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const persist = useCallback(
    async (testPatch: Partial<SiteTest>) => {
      if (!project) return;
      const tests = (project.tests || []).map((t) =>
        t.id === testId ? { ...t, ...testPatch } : t,
      );
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tests }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        refreshProjects();
      }
    },
    [project, projectId, testId, refreshProjects],
  );

  const flushSave = useCallback(() => {
    const s = stateRef.current;
    persist({
      name: s.name.trim() || "Untitled test",
      steps: s.steps,
      breakpoints: s.breakpoints,
      variants: BUILT_IN_VARIANTS.filter((v) => s.variantIds.includes(v.id)),
      credentials: s.credentials,
    });
  }, [persist]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  const commitName = () => {
    setEditingName(false);
    flushSave();
  };

  const updateStep = (id: string, patch: Partial<TestStep>) => {
    setSteps((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    scheduleSave();
  };

  const removeStep = (id: string) => {
    setSteps((cur) => cur.filter((s) => s.id !== id));
    scheduleSave();
  };

  const reorderStep = (fromIndex: number, toIndex: number) => {
    setSteps((cur) => {
      const next = [...cur];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    scheduleSave();
  };

  const addUrlStep = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setSteps((cur) => [
      ...cur,
      { id: crypto.randomUUID(), type: "url", url: trimmed, captureScreenshot: true },
    ]);
    setStepEditor(null);
    scheduleSave();
  };

  const addMicrotestStep = (microTestId: string) => {
    setSteps((cur) => [
      ...cur,
      { id: crypto.randomUUID(), type: "microtest", microTestId, captureScreenshot: true },
    ]);
    setStepEditor(null);
    scheduleSave();
  };

  // The active test object (always derived from project + testId so live
  // edits propagate without needing an extra useState).
  const activeTest: SiteTest | undefined = project?.tests?.find((t) => t.id === testId);

  const otherTests = (project?.tests || []).filter((t) => t.id !== testId && !t.archived);
  const microTests: MicroTest[] = project?.microTests || [];

  return (
    <div
      className={`project-settings-overlay project-settings-overlay--${animState}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      style={{ transitionDuration: animState === "exiting" ? `${EXIT_MS}ms` : `${ENTER_MS}ms` }}
    >
      <div
        className="project-settings-overlay__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="test-settings-title"
      >
        <header className="project-settings-overlay__header">
          {stepEditor ? (
            <button
              type="button"
              onClick={() => setStepEditor(null)}
              className="icon-btn"
              title="Back to test settings"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}

          {!stepEditor && (
            <>
              {editingName ? (
                <input
                  autoFocus
                  className="project-settings-overlay__title-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitName();
                    if (e.key === "Escape") {
                      setName(activeTest?.name || "");
                      setEditingName(false);
                    }
                  }}
                  placeholder="Test name"
                />
              ) : (
                <button
                  type="button"
                  className="project-settings-overlay__title-button"
                  onClick={() => setEditingName(true)}
                  title="Click to rename"
                >
                  <span id="test-settings-title" className="project-settings-overlay__title">
                    {name || "Untitled test"}
                  </span>
                  <svg
                    className="project-settings-overlay__title-icon"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M16.5 4.5l3 3L8 19l-4 1 1-4L16.5 4.5z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </>
          )}

          {stepEditor && (
            <span className="project-settings-overlay__title">
              {stepEditor.mode === "create" ? "Add step" : "Edit step"}
            </span>
          )}

          {!stepEditor && (
            <button
              type="button"
              className="icon-btn project-settings-overlay__close"
              onClick={handleClose}
              title="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </header>

        <div className="project-settings-overlay__body">
          {!project || !activeTest ? (
            <p style={{ color: "var(--text-muted)" }}>Loading...</p>
          ) : stepEditor ? (
            <AddEditStepView
              microTests={microTests}
              steps={steps}
              editing={stepEditor.mode === "edit"
                ? steps.find((s) => s.id === stepEditor.stepId) ?? null
                : null}
              onUpdate={updateStep}
              onAddUrl={addUrlStep}
              onAddMicrotest={addMicrotestStep}
              onCancel={() => setStepEditor(null)}
            />
          ) : (
            <>
              <section className="test-steps">
                <h3 className="test-steps__heading">Test steps</h3>

                {steps.length === 0 ? (
                  <EmptySteps
                    onPickUrl={() => setStepEditor({ mode: "create" })}
                    onPickMicrotest={() => setStepEditor({ mode: "create" })}
                  />
                ) : (
                  <ul className="test-steps__list">
                    {steps.map((step, i) => (
                      <StepRow
                        key={step.id}
                        step={step}
                        microTests={microTests}
                        index={i}
                        total={steps.length}
                        onEdit={() => setStepEditor({ mode: "edit", stepId: step.id })}
                        onToggleScreenshot={() =>
                          updateStep(step.id, { captureScreenshot: step.captureScreenshot === false })
                        }
                        onRemove={() => removeStep(step.id)}
                        onMoveUp={() => i > 0 && reorderStep(i, i - 1)}
                        onMoveDown={() => i < steps.length - 1 && reorderStep(i, i + 1)}
                      />
                    ))}
                  </ul>
                )}

                <button
                  type="button"
                  className="btn btn--outline test-steps__add"
                  onClick={() => setStepEditor({ mode: "create" })}
                >
                  Add step
                </button>
              </section>

              <hr className="project-settings-overlay__divider" />

              <Accordion
                title="Test settings"
                open={openAccordion === "settings"}
                onToggle={() =>
                  setOpenAccordion((cur) => (cur === "settings" ? null : "settings"))
                }
              >
                <div className="test-settings-section">
                  <BreakpointEditor
                    breakpoints={breakpoints}
                    onChange={(bp) => {
                      setBreakpoints(bp);
                      scheduleSave();
                    }}
                  />
                  <div className="test-settings-section__variants">
                    <p className="test-settings-section__label">Variants</p>
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
                                scheduleSave();
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
              </Accordion>

              <hr className="project-settings-overlay__divider" />

              <Accordion
                title="Credentials"
                open={openAccordion === "credentials"}
                onToggle={() =>
                  setOpenAccordion((cur) => (cur === "credentials" ? null : "credentials"))
                }
              >
                <CredentialsSection
                  credentials={credentials}
                  otherTests={otherTests}
                  onChange={(next) => {
                    setCredentials(next);
                    scheduleSave();
                  }}
                />
              </Accordion>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Subcomponents ───────────────────────────────────────────────────── */

function StepRow({
  step,
  microTests,
  onEdit,
  onToggleScreenshot,
  onRemove,
  onMoveUp,
  onMoveDown,
  index,
  total,
}: {
  step: TestStep;
  microTests: MicroTest[];
  onEdit: () => void;
  onToggleScreenshot: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  index: number;
  total: number;
}) {
  const label =
    step.type === "url"
      ? step.url || "(empty URL)"
      : microTests.find((m) => m.id === step.microTestId)?.displayName || "(missing micro-test)";

  const captureOn = step.captureScreenshot !== false;

  return (
    <li className="step-row">
      <span className="step-row__grip" aria-hidden="true">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          className="step-row__grip-btn"
          title="Move up"
        >
          ▴
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="step-row__grip-btn"
          title="Move down"
        >
          ▾
        </button>
      </span>

      <span
        className={`step-row__type-icon step-row__type-icon--${step.type}`}
        title={step.type === "url" ? "URL step" : "Playwright step"}
        aria-hidden="true"
      >
        {step.type === "url" ? <UrlIcon /> : <PlaywrightIcon />}
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
          <CameraIcon />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="icon-btn step-row__trash"
          title="Remove step"
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  );
}

function EmptySteps({
  onPickUrl,
  onPickMicrotest,
}: {
  onPickUrl: () => void;
  onPickMicrotest: () => void;
}) {
  return (
    <div className="empty-steps">
      <p className="empty-steps__copy">No steps yet — start with a URL or a Playwright snippet.</p>
      <div className="empty-steps__actions">
        <button type="button" className="btn btn--outline" onClick={onPickUrl}>
          Add URL
        </button>
        <button type="button" className="btn btn--outline" onClick={onPickMicrotest}>
          Record with Playwright
        </button>
      </div>
    </div>
  );
}

function Accordion({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="ts-accordion">
      <button
        type="button"
        className="project-settings-overlay__danger-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="project-settings-overlay__section-title">{title}</span>
        <span className="project-settings-overlay__danger-glyph" aria-hidden="true">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && <div className="ts-accordion__body">{children}</div>}
    </div>
  );
}

function CredentialsSection({
  credentials,
  otherTests,
  onChange,
}: {
  credentials: TestCredentials | undefined;
  otherTests: SiteTest[];
  onChange: (next: TestCredentials | undefined) => void;
}) {
  const enabled = credentials?.enabled === true;
  const copyFromId = credentials?.copyFromTestId ?? "";

  return (
    <div className="credentials-section">
      <label className="credentials-section__row">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            onChange({ ...credentials, enabled: e.target.checked })
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
            onChange({
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

      {!enabled && !copyFromId && (
        <p className="credentials-section__hint">
          No credentials configured — runs use the project default.
        </p>
      )}
    </div>
  );
}

/* ── Add / Edit step view ────────────────────────────────────────────── */

function AddEditStepView({
  microTests,
  editing,
  onUpdate,
  onAddUrl,
  onAddMicrotest,
  onCancel,
}: {
  microTests: MicroTest[];
  steps: TestStep[];
  editing: TestStep | null;
  onUpdate: (id: string, patch: Partial<TestStep>) => void;
  onAddUrl: (url: string) => void;
  onAddMicrotest: (microTestId: string) => void;
  onCancel: () => void;
}) {
  // Empty editor: pick URL or Playwright
  const [pickedType, setPickedType] = useState<"url" | "microtest" | null>(
    editing ? editing.type : null,
  );
  const [urlValue, setUrlValue] = useState<string>(editing?.url ?? "");
  const [microId, setMicroId] = useState<string>(editing?.microTestId ?? microTests[0]?.id ?? "");

  const urlCheck = checkUrl(urlValue);
  const urlStatus = !urlValue ? "idle" : urlCheck.ok ? "valid" : "invalid";

  const handleSaveUrl = () => {
    if (!urlCheck.ok) return;
    if (editing) {
      onUpdate(editing.id, { url: urlValue.trim() });
      onCancel();
    } else {
      onAddUrl(urlValue.trim());
    }
  };

  const handleSaveMicro = () => {
    if (!microId) return;
    if (editing) {
      onUpdate(editing.id, { microTestId: microId });
      onCancel();
    } else {
      onAddMicrotest(microId);
    }
  };

  if (!pickedType) {
    return (
      <div className="add-step-fork">
        <p className="add-step-fork__copy">
          What kind of step do you want to add?
        </p>
        <div className="add-step-fork__cards">
          <button
            type="button"
            className="add-step-fork__card"
            onClick={() => setPickedType("url")}
          >
            <UrlIcon className="add-step-fork__card-icon" />
            <span className="add-step-fork__card-title">URL</span>
            <span className="add-step-fork__card-copy">Navigate to a URL and capture a screenshot.</span>
          </button>
          <button
            type="button"
            className="add-step-fork__card"
            onClick={() => setPickedType("microtest")}
          >
            <PlaywrightIcon className="add-step-fork__card-icon" />
            <span className="add-step-fork__card-title">Playwright</span>
            <span className="add-step-fork__card-copy">Run a Playwright script — type it or record one.</span>
          </button>
        </div>
      </div>
    );
  }

  if (pickedType === "url") {
    return (
      <div className="step-editor">
        <MaterialField
          label="URL"
          value={urlValue}
          onChange={(e) => setUrlValue(e.target.value)}
          placeholder="https://example.com or /about"
          status={urlStatus}
          error={urlStatus === "invalid" ? urlCheck.ok ? null : urlCheck.reason : null}
          autoFocus
          spellCheck={false}
        />
        <div className="step-editor__actions">
          <button type="button" className="btn btn--text" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleSaveUrl}
            disabled={!urlCheck.ok}
          >
            {editing ? "Save" : "Add step"}
          </button>
        </div>
      </div>
    );
  }

  // Playwright (microtest) editor — minimal for Phase 2: pick from project's
  // micro-test library or open the dedicated editor in another surface. Full
  // inline script editing + record-with-Playwright is the next refinement.
  return (
    <div className="step-editor">
      <p className="step-editor__hint">
        Pick an existing Playwright snippet from this project&apos;s library.
        Inline script editing and Record-with-Playwright land in the next pass.
      </p>
      <label className="step-editor__field">
        <span className="step-editor__label">Micro-test</span>
        <select
          className="input"
          value={microId}
          onChange={(e) => setMicroId(e.target.value)}
        >
          {microTests.length === 0 ? (
            <option value="">No micro-tests in this project yet</option>
          ) : (
            microTests.map((m) => (
              <option key={m.id} value={m.id}>{m.displayName}</option>
            ))
          )}
        </select>
      </label>
      <div className="step-editor__actions">
        <button type="button" className="btn btn--text" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleSaveMicro}
          disabled={!microId}
        >
          {editing ? "Save" : "Add step"}
        </button>
      </div>
    </div>
  );
}

/* ── Icons ───────────────────────────────────────────────────────────── */

function UrlIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function PlaywrightIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
