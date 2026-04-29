"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { basicSetup } from "codemirror";
import MaterialField from "@/components/MaterialField";
import BreakpointEditor from "@/components/settings/BreakpointEditor";
import { useSidebar } from "@/components/SidebarProvider";
import { BREAKPOINTS, BUILT_IN_VARIANTS } from "@/lib/constants";
import { getTestSteps } from "@/lib/test-steps";
import { resolveProjectPath } from "@/lib/url-utils";
import type {
  Project,
  SiteTest,
  TestStep,
  TestCredentials,
} from "@/lib/types";

const ENTER_MS = 180;
const EXIT_MS = 140;
const SAVE_DEBOUNCE_MS = 600;

type AccordionId = "settings" | "credentials" | "danger";

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

  // Inline-undo for delete: when set, the step list renders a "Deleted: …
  // Undo" row at this index in place of the removed step. Saves are
  // deferred until the timer expires; if the user undoes within 3 s the
  // step is restored at its original position with no save churn.
  const [pendingDelete, setPendingDelete] = useState<{ index: number; step: TestStep } | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag-to-reorder: tracks the current dragging step index. Reorder is
  // committed on dragenter (live preview); save fires once on dragend.
  const [dragIndex, setDragIndex] = useState<number | null>(null);

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
    const idx = steps.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const step = steps[idx];

    // If a previous pending delete is still active, finalize it before
    // queuing the new one (don't lose its persistence).
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
      scheduleSave();
    }

    setSteps((cur) => cur.filter((s) => s.id !== id));
    setPendingDelete({ index: idx, step });

    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      setPendingDelete(null);
      scheduleSave();
    }, 3000);
  };

  const undoDelete = () => {
    // Read pendingDelete from state (not via the updater) so setSteps fires
    // exactly once. Calling setSteps inside a setPendingDelete updater
    // gets the splice run twice under React StrictMode and duplicates the
    // restored step.
    if (!pendingDelete) return;
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    const { index, step } = pendingDelete;
    setSteps((cur) => {
      const next = [...cur];
      next.splice(index, 0, step);
      return next;
    });
    setPendingDelete(null);
  };

  const handleStepDragEnter = (i: number) => {
    if (dragIndex === null || i === dragIndex) return;
    setSteps((cur) => {
      const next = [...cur];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(i, 0, moved);
      return next;
    });
    setDragIndex(i);
  };

  const handleStepDragEnd = () => {
    setDragIndex(null);
    scheduleSave();
  };

  // Persist any pending delete + drag save when the overlay unmounts.
  useEffect(() => {
    return () => {
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
        // The pending step has already been removed from local state;
        // flushSave on close will write it.
      }
    };
  }, []);

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

  const addScriptStep = (name: string, script: string) => {
    setSteps((cur) => [
      ...cur,
      {
        id: crypto.randomUUID(),
        type: "microtest",
        name: name.trim() || "Untitled step",
        script,
        captureScreenshot: true,
      },
    ]);
    setStepEditor(null);
    scheduleSave();
  };

  // The active test object (always derived from project + testId so live
  // edits propagate without needing an extra useState).
  const activeTest: SiteTest | undefined = project?.tests?.find((t) => t.id === testId);

  const otherTests = (project?.tests || []).filter((t) => t.id !== testId && !t.archived);

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
              className="btn btn--text project-settings-overlay__back"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Back to steps</span>
            </button>
          ) : (
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
            </>
          )}
        </header>

        <div className="project-settings-overlay__body">
          {!project || !activeTest ? (
            <p style={{ color: "var(--text-muted)" }}>Loading...</p>
          ) : stepEditor ? (
            <AddEditStepView
              projectUrls={[project.prodUrl, project.devUrl]}
              editing={stepEditor.mode === "edit"
                ? steps.find((s) => s.id === stepEditor.stepId) ?? null
                : null}
              onUpdate={updateStep}
              onAddUrl={addUrlStep}
              onAddScript={addScriptStep}
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
                      <Fragment key={step.id}>
                        {pendingDelete?.index === i && (
                          <PendingDeleteRow
                            step={pendingDelete.step}
                            onUndo={undoDelete}
                          />
                        )}
                        <StepRow
                          step={step}
                          dragging={dragIndex === i}
                          onDragStart={() => setDragIndex(i)}
                          onDragEnter={() => handleStepDragEnter(i)}
                          onDragEnd={handleStepDragEnd}
                          onEdit={() => setStepEditor({ mode: "edit", stepId: step.id })}
                          onToggleScreenshot={() =>
                            updateStep(step.id, { captureScreenshot: step.captureScreenshot === false })
                          }
                          onRemove={() => removeStep(step.id)}
                        />
                      </Fragment>
                    ))}
                    {pendingDelete && pendingDelete.index >= steps.length && (
                      <PendingDeleteRow
                        step={pendingDelete.step}
                        onUndo={undoDelete}
                      />
                    )}
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

              <hr className="project-settings-overlay__divider" />

              <Accordion
                title="Danger Zone"
                open={openAccordion === "danger"}
                onToggle={() =>
                  setOpenAccordion((cur) => (cur === "danger" ? null : "danger"))
                }
              >
                <div className="project-settings-overlay__danger-body">
                  <section className="project-settings-overlay__danger-section">
                    <h3 className="project-settings-overlay__danger-heading">
                      Archive test
                    </h3>
                    <p className="project-settings-overlay__danger-copy">
                      Hide this test from the sidebar. Reports are preserved
                      and the test can be restored from the project Danger
                      Zone.
                    </p>
                    <button
                      type="button"
                      className="btn btn--outline"
                      onClick={async () => {
                        // Persist archive flag, then close overlay so the
                        // sidebar stops showing the test.
                        await persist({ archived: true });
                        handleClose();
                      }}
                    >
                      Archive
                    </button>
                  </section>
                </div>
              </Accordion>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Subcomponents ───────────────────────────────────────────────────── */

/** Display label for a step in the steps list and the deleted-undo row. */
function stepLabel(step: TestStep): string {
  if (step.type === "url") return step.url || "(empty path)";
  return step.name || "(unnamed script)";
}

function StepRow({
  step,
  dragging,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onEdit,
  onToggleScreenshot,
  onRemove,
}: {
  step: TestStep;
  dragging?: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onEdit: () => void;
  onToggleScreenshot: () => void;
  onRemove: () => void;
}) {
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
        <GripIcon />
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

function PendingDeleteRow({
  step,
  onUndo,
}: {
  step: TestStep;
  onUndo: () => void;
}) {
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

function EmptySteps({
  onPickUrl,
  onPickMicrotest,
}: {
  onPickUrl: () => void;
  onPickMicrotest: () => void;
}) {
  return (
    <div className="empty-steps">
      <p className="empty-steps__heading">No steps yet.</p>
      <p className="empty-steps__copy">
        Start with a path you want to capture, or paste a Playwright script to
        navigate the app.
      </p>
      <div className="empty-steps__actions">
        <button type="button" className="btn btn--outline" onClick={onPickUrl}>
          Add path
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
  editing,
  projectUrls,
  onUpdate,
  onAddUrl,
  onAddScript,
  onCancel,
}: {
  editing: TestStep | null;
  /** Project's prod + dev URLs — used to validate that the user-entered
   *  path/URL belongs to one of our domains. */
  projectUrls: string[];
  onUpdate: (id: string, patch: Partial<TestStep>) => void;
  onAddUrl: (url: string) => void;
  onAddScript: (name: string, script: string) => void;
  onCancel: () => void;
}) {
  const [pickedType, setPickedType] = useState<"url" | "microtest" | null>(
    editing ? editing.type : null,
  );
  const [pathInput, setPathInput] = useState<string>(editing?.url ?? "");

  // Resolve the input down to a path. Accepts full URLs (which get stripped
  // to their pathname) and bare paths. Errors on third-party domains.
  const resolved = pathInput.trim() ? resolveProjectPath(pathInput, projectUrls) : null;
  const pathStatus =
    !pathInput ? "idle" : resolved?.ok ? "valid" : "invalid";

  const handleSavePath = () => {
    if (!resolved?.ok) return;
    const value = resolved.path;
    if (editing) {
      onUpdate(editing.id, { url: value });
      onCancel();
    } else {
      onAddUrl(value);
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
            <span className="add-step-fork__card-title">Path</span>
            <span className="add-step-fork__card-copy">Navigate to a page on this site and capture a screenshot.</span>
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
          label="Path"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          placeholder="/about"
          status={pathStatus}
          error={pathStatus === "invalid" && resolved && !resolved.ok ? resolved.error : null}
          hint={resolved?.ok && resolved.path !== pathInput.trim()
            ? `Will be saved as ${resolved.path}`
            : undefined}
          autoFocus
          spellCheck={false}
        />
        <div className="step-editor__actions">
          <button type="button" className="btn btn--text" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleSavePath}
            disabled={!resolved?.ok}
          >
            {editing ? "Save" : "Add step"}
          </button>
        </div>
      </div>
    );
  }

  // Playwright (script) editor — inline CodeMirror, no separate library.
  return (
    <ScriptStepEditor
      editing={editing}
      onSave={(name, script) => {
        if (editing) {
          onUpdate(editing.id, { name, script });
          onCancel();
        } else {
          onAddScript(name, script);
        }
      }}
      onCancel={onCancel}
    />
  );
}

/**
 * Inline Playwright-script step editor. Lifted from the deleted
 * MicroTestEditor — same CodeMirror setup, but writes the script directly
 * onto the step instead of into a separate microTests collection.
 */
function ScriptStepEditor({
  editing,
  onSave,
  onCancel,
}: {
  editing: TestStep | null;
  onSave: (name: string, script: string) => void;
  onCancel: () => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [name, setName] = useState(editing?.name ?? "");

  // Stable callback ref so the keymap can call the latest version without
  // us re-binding the editor. Mod-S grabs the live name + doc and saves.
  const saveRef = useRef(() => {});
  saveRef.current = () => {
    const script = viewRef.current?.state.doc.toString() ?? editing?.script ?? "";
    onSave(name, script);
  };

  useEffect(() => {
    if (!editorRef.current) return;
    const state = EditorState.create({
      doc: editing?.script ?? "",
      extensions: [
        basicSetup,
        javascript({ typescript: true }),
        oneDark,
        EditorView.lineWrapping,
        cmPlaceholder(
          '// Your script receives `page` (Playwright Page) and `expect`\nawait page.click("button");',
        ),
        keymap.of([
          {
            key: "Mod-s",
            run: () => {
              saveRef.current();
              return true;
            },
          },
        ]),
      ],
    });
    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;
    return () => view.destroy();
    // Re-mount only when switching between create/edit of different steps;
    // keystrokes shouldn't reset the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  return (
    <div className="step-editor">
      <label className="step-editor__field">
        <span className="step-editor__label">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Click sign in"
          className="input input--compact"
          autoFocus
        />
      </label>
      <p className="step-editor__hint">
        Your script receives <code className="code-inline code-inline--xs">page</code>{" "}
        (Playwright Page) and <code className="code-inline code-inline--xs">expect</code>{" "}
        as arguments.
      </p>
      <div ref={editorRef} className="code-editor" />
      <div className="step-editor__actions">
        <button type="button" className="btn btn--text" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => saveRef.current()}
          disabled={!name.trim()}
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

function GripIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  );
}
