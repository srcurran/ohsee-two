"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import BreakpointEditor from "@/components/settings/BreakpointEditor";
import { useSidebar } from "@/components/utility/SidebarProvider";
import { BUILT_IN_VARIANTS } from "@/lib/constants";
import { Accordion } from "@/components/settings/TestSettingsAccordion";
import { CredentialsSection } from "@/components/settings/TestSettingsCredentials";
import ScriptEditor from "@/components/settings/ScriptEditor";
import { EmptySteps } from "@/components/settings/TestSettingsEmpty";
import { PendingDeleteRow, StepRow } from "@/components/settings/TestSettingsStepRow";
import { AddEditStepView } from "@/components/settings/TestSettingsStepEditor";
import { useOverlayAnim } from "@/components/settings/use/overlayAnim";
import { useStepDrag } from "@/components/settings/use/stepDrag";
import { useStepsState } from "@/components/settings/use/stepsState";
import { useTestSettingsData } from "@/components/settings/use/testSettingsData";
import { Icon } from "@/components/utility/Icon";

type AccordionId = "steps" | "settings" | "credentials" | "danger";

interface Props {
  projectId: string;
  testId: string;
  onClose: () => void;
}

/** Test-settings overlay shell. Composes the data, steps, drag, and
 * animation hooks with the step-list / accordion / step-editor child views.
 * Holds only the small bits of UI state that don't fit into a hook:
 * editor-vs-list mode, inline rename, and which accordion is open. */
export default function TestSettingsOverlay({ projectId, testId, onClose }: Props) {
  const { refreshProjects } = useSidebar();

  // Sub-views: when an step is being added or edited, the overlay body is
  // replaced by AddEditStepView. `null` = step list is shown.
  const [stepEditor, setStepEditor] = useState<
    | { mode: "create"; initialType?: "url" | "microtest" }
    | { mode: "edit"; stepId: string }
    | null
  >(null);

  const [editingName, setEditingName] = useState(false);
  const [openAccordion, setOpenAccordion] = useState<AccordionId | null>("steps");

  // `beforeExit` needs to call into the data hook, which is initialized
  // below — bridge through a ref so the close callback can see the latest
  // `cancelAndFlushIfPending` without a forward reference.
  const beforeExitRef = useRef<() => void>(() => {});
  const beforeExit = useCallback(() => beforeExitRef.current(), []);

  const { animState, enterMs, exitMs, handleClose } = useOverlayAnim({
    onClose,
    hasNestedView: !!stepEditor,
    onBackNested: () => setStepEditor(null),
    beforeExit,
  });

  const data = useTestSettingsData({
    projectId,
    testId,
    refreshProjects,
    onMissing: handleClose,
  });

  const stepsState = useStepsState({
    steps: data.steps,
    setSteps: data.setSteps,
    scheduleSave: data.scheduleSave,
  });

  const drag = useStepDrag({
    setSteps: data.setSteps,
    scheduleSave: data.scheduleSave,
  });

  useEffect(() => {
    beforeExitRef.current = data.cancelAndFlushIfPending;
  }, [data.cancelAndFlushIfPending]);

  const commitName = () => {
    setEditingName(false);
    data.flushSave();
  };

  const handleAddUrl = (url: string) => {
    stepsState.addUrlStep(url);
    setStepEditor(null);
  };

  const handleAddScript = (name: string, script: string) => {
    stepsState.addScriptStep(name, script);
    setStepEditor(null);
  };

  // Advanced tests author a single script; simple tests use the step list.
  const isAdvanced = data.activeTest?.testType === "advanced";

  return (
    <div
      className={`project-settings-overlay project-settings-overlay--${animState}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      style={{ transitionDuration: animState === "exiting" ? `${exitMs}ms` : `${enterMs}ms` }}
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
              <Icon name="chevron-left" size={16} />
              <span>Back to steps</span>
            </button>
          ) : (
            <>
              {editingName ? (
                <input
                  autoFocus
                  className="project-settings-overlay__title-input"
                  value={data.name}
                  onChange={(e) => data.setName(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitName();
                    if (e.key === "Escape") {
                      data.setName(data.activeTest?.name || "");
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
                    {data.name || "Untitled test"}
                  </span>
                  <Icon name="edit" size={16} className="project-settings-overlay__title-icon" />
                </button>
              )}
              <button
                type="button"
                className="icon-btn project-settings-overlay__close"
                onClick={handleClose}
                title="Close"
              >
                <Icon name="close" size={20} />
              </button>
            </>
          )}
        </header>

        <div className="project-settings-overlay__body">
          {!data.project || !data.activeTest ? (
            <p style={{ color: "var(--neutral-dark-500)" }}>Loading...</p>
          ) : stepEditor ? (
            <AddEditStepView
              projectUrls={[data.project.prodUrl, data.project.devUrl]}
              editing={stepEditor.mode === "edit"
                ? data.steps.find((s) => s.id === stepEditor.stepId) ?? null
                : null}
              initialType={stepEditor.mode === "create" ? stepEditor.initialType : undefined}
              onUpdate={stepsState.updateStep}
              onAddUrl={handleAddUrl}
              onAddScript={handleAddScript}
              onCancel={() => setStepEditor(null)}
            />
          ) : (
            <>
              <div className="ts-accordion-group">
                <Accordion
                  title={isAdvanced ? "Script" : "Test steps"}
                  open={openAccordion === "steps"}
                  onToggle={() =>
                    setOpenAccordion((cur) => (cur === "steps" ? null : "steps"))
                  }
                >
                  {isAdvanced ? (
                    <section className="test-steps">
                      <ScriptEditor
                        value={data.script}
                        onChange={(s) => {
                          data.setScript(s);
                          data.scheduleSave();
                        }}
                        defaultUrl={data.project.prodUrl}
                      />
                    </section>
                  ) : (
                  <section className="test-steps">
                    {data.steps.length === 0 ? (
                      <EmptySteps
                        onPickUrl={() => setStepEditor({ mode: "create", initialType: "url" })}
                        onPickMicrotest={() => setStepEditor({ mode: "create", initialType: "microtest" })}
                      />
                    ) : (
                      <ul className="test-steps__list">
                        {data.steps.map((step, i) => (
                          <Fragment key={step.id}>
                            {stepsState.pendingDelete?.index === i && (
                              <PendingDeleteRow
                                step={stepsState.pendingDelete.step}
                                onUndo={stepsState.undoDelete}
                              />
                            )}
                            <StepRow
                              step={step}
                              dragging={drag.dragIndex === i}
                              onDragStart={() => drag.onDragStart(i)}
                              onDragEnter={() => drag.onDragEnter(i)}
                              onDragEnd={drag.onDragEnd}
                              onEdit={() => setStepEditor({ mode: "edit", stepId: step.id })}
                              onToggleScreenshot={() =>
                                stepsState.updateStep(step.id, { captureScreenshot: step.captureScreenshot === false })
                              }
                              onRemove={() => stepsState.removeStep(step.id)}
                            />
                          </Fragment>
                        ))}
                        {stepsState.pendingDelete && stepsState.pendingDelete.index >= data.steps.length && (
                          <PendingDeleteRow
                            step={stepsState.pendingDelete.step}
                            onUndo={stepsState.undoDelete}
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
                  )}
                </Accordion>

                <Accordion
                  title="Test settings"
                  open={openAccordion === "settings"}
                  onToggle={() =>
                    setOpenAccordion((cur) => (cur === "settings" ? null : "settings"))
                  }
                >
                  <div className="test-settings-section">
                    <BreakpointEditor
                      breakpoints={data.breakpoints}
                      onChange={(bp) => {
                        data.setBreakpoints(bp);
                        data.scheduleSave();
                      }}
                    />
                    <div className="test-settings-section__variants">
                      <p className="test-settings-section__label">Variants</p>
                      <div className="variant-list">
                        {BUILT_IN_VARIANTS.map((v) => {
                          const active = data.variantIds.includes(v.id);
                          return (
                            <label key={v.id} className="variant-option">
                              <input
                                type="checkbox"
                                checked={active}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...data.variantIds, v.id]
                                    : data.variantIds.filter((id) => id !== v.id);
                                  data.setVariantIds(next);
                                  data.scheduleSave();
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

                <Accordion
                  title="Credentials"
                  open={openAccordion === "credentials"}
                  onToggle={() =>
                    setOpenAccordion((cur) => (cur === "credentials" ? null : "credentials"))
                  }
                >
                  <CredentialsSection
                    credentials={data.credentials}
                    onChange={(next) => {
                      data.setCredentials(next);
                      data.scheduleSave();
                    }}
                    hasTemplateVars={data.steps.some(
                      (s) =>
                        s.type === "microtest" &&
                        s.script &&
                        /\$(EMAIL|PASSWORD|OTP)\$/.test(s.script),
                    )}
                  />
                </Accordion>

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
                          await data.persist({ archived: true });
                          handleClose();
                        }}
                      >
                        Archive
                      </button>
                    </section>
                  </div>
                </Accordion>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
