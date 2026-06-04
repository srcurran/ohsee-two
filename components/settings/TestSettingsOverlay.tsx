"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import BreakpointEditor from "@/components/settings/shared/BreakpointEditor";
import { useSidebar } from "@/components/utility/SidebarProvider";
import { BUILT_IN_VARIANTS } from "@/lib/constants";
import { Accordion } from "@/components/settings/shared/SettingsAccordion";
import AuthProfileSelect from "@/components/settings/shared/AuthProfileSelect";
import AuthProfilesPanel from "@/components/settings/shared/AuthProfilesPanel";
import SettingsOverlayShell from "@/components/settings/shared/SettingsOverlayShell";
import ScriptEditor from "@/components/settings/shared/ScriptEditor";
import FastModeToggle from "@/components/settings/shared/FastModeToggle";
import { EmptySteps } from "@/components/settings/TestSettingsEmpty";
import { PendingDeleteRow, StepRow } from "@/components/settings/TestSettingsStepRow";
import { AddEditStepView } from "@/components/settings/TestSettingsStepEditor";
import { useOverlayAnim } from "@/components/settings/use/overlayAnim";
import { useStepDrag } from "@/components/settings/use/stepDrag";
import { useStepsState } from "@/components/settings/use/stepsState";
import { useTestSettingsData } from "@/components/settings/use/testSettingsData";
import { useMediaQuery } from "@/components/utility/use/useMediaQuery";
import { Icon } from "@/components/utility/Icon";
import type { TestStep } from "@/lib/types";

type AccordionId = "steps" | "settings" | "signin" | "danger";

/** Seed a Playwright script from a simple test's steps when upgrading it:
 *  each path becomes a goto + snapshot; any legacy inline Playwright step is
 *  inlined as-is. A sensible starting point the user can then edit. */
function scriptFromSteps(steps: TestStep[]): string {
  const parts: string[] = [];
  for (const s of steps) {
    if (s.type === "url" && s.url) {
      const slug = s.url.replace(/^\/+|\/+$/g, "").replace(/\//g, "-") || "home";
      parts.push(`await page.goto('${s.url}');\nawait ohsee.snapshot('${slug}');`);
    } else if (s.type === "microtest" && s.script) {
      parts.push(s.script.trim());
    }
  }
  return (parts.length ? parts.join("\n\n") : "await page.goto('/');\nawait ohsee.snapshot('home');") + "\n";
}

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
  // Narrow: stacked accordions (one open at a time). Tablet+: a left-rail nav
  // (one active section). Same section list drives both.
  const wide = useMediaQuery("(min-width: 768px)");
  const [openAccordion, setOpenAccordion] = useState<AccordionId | null>("steps");
  const [activeSection, setActiveSection] = useState<AccordionId>("steps");

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

  // One-way upgrade: turn a simple (path) test into an advanced Playwright
  // test, seeding the script from its current steps.
  const handleConvertToPlaywright = async () => {
    if (
      !window.confirm(
        "Convert this to a Playwright test? Your path steps become an editable script. This can't be undone.",
      )
    )
      return;
    const script = scriptFromSteps(data.steps);
    data.setScript(script);
    data.setSteps([]);
    await data.persist({ testType: "advanced", script, steps: [] });
  };

  // Advanced tests author a single script; simple tests use the step list.
  const isAdvanced = data.activeTest?.testType === "advanced";

  // The section list — rendered as a rail+pane (tablet+) or accordions
  // (narrow). Built once; content is defined here so both layouts share it.
  const sections: { id: AccordionId; label: string; content: ReactNode }[] = (() => {
    const project = data.project;
    if (!project || !data.activeTest) return [];
    const stepsContent = isAdvanced ? (
      <section className="test-steps">
        <AuthProfileSelect
          profiles={project.authProfiles ?? []}
          value={data.authProfileId}
          onChange={(id) => { data.setAuthProfileId(id); data.scheduleSave(); }}
          onManage={() => { setActiveSection("signin"); setOpenAccordion("signin"); }}
        />
        <ScriptEditor
          value={data.script}
          onChange={(s) => { data.setScript(s); data.scheduleSave(); }}
          defaultUrl={project.prodUrl}
        />
      </section>
    ) : (
      <section className="test-steps">
        <AuthProfileSelect
          profiles={project.authProfiles ?? []}
          value={data.authProfileId}
          onChange={(id) => { data.setAuthProfileId(id); data.scheduleSave(); }}
          onManage={() => { setActiveSection("signin"); setOpenAccordion("signin"); }}
        />
        {data.steps.length === 0 ? (
          <EmptySteps
            onPickUrl={() => setStepEditor({ mode: "create", initialType: "url" })}
          />
        ) : (
          <ul className="test-steps__list">
            {data.steps.map((step, i) => (
              <Fragment key={step.id}>
                {stepsState.pendingDelete?.index === i && (
                  <PendingDeleteRow step={stepsState.pendingDelete.step} onUndo={stepsState.undoDelete} />
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
              <PendingDeleteRow step={stepsState.pendingDelete.step} onUndo={stepsState.undoDelete} />
            )}
          </ul>
        )}
        <button
          type="button"
          className="btn btn--outline test-steps__add"
          onClick={() => setStepEditor({ mode: "create", initialType: "url" })}
        >
          Add path
        </button>
        <button
          type="button"
          className="btn--text self-start test-steps__convert"
          onClick={handleConvertToPlaywright}
        >
          Convert to a Playwright test
        </button>
      </section>
    );

    const settingsContent = (
      <div className="test-settings-section">
        <BreakpointEditor
          breakpoints={data.breakpoints}
          onChange={(bp) => { data.setBreakpoints(bp); data.scheduleSave(); }}
        />
        <div className="test-settings-section__variants stack stack--sm">
          <h3>Variants</h3>
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
        <FastModeToggle />
      </div>
    );

    const dangerContent = (
      <div className="settings-overlay__danger-body">
        <section className="settings-overlay__danger-section stack stack--md">
          <div className="stack stack--xs">
            <h3>Archive test</h3>
            <p className="settings-overlay__danger-copy">
              Hide this test from the sidebar. Reports are preserved and the test
              can be restored from the project Danger Zone.
            </p>
            <button
                type="button"
                className="btn btn--outline"
                onClick={async () => {
                  await data.persist({ archived: true });
                  handleClose();
                }}
            >
              Archive
            </button>
          </div>
        </section>
      </div>
    )

    return [
      { id: "steps" as AccordionId, label: isAdvanced ? "Script" : "Test steps", content: stepsContent },
      { id: "settings" as AccordionId, label: "Test settings", content: settingsContent },
      {
        id: "signin" as AccordionId,
        label: "Sign-in profiles",
        content: <AuthProfilesPanel projectId={projectId} />,
      },
      { id: "danger" as AccordionId, label: "Danger Zone", content: dangerContent },
    ];
  })();

  return (
    <SettingsOverlayShell
      animState={animState}
      enterMs={enterMs}
      exitMs={exitMs}
      onBackdropClose={handleClose}
      labelledBy="test-settings-title"
      header={
        stepEditor ? (
            <button
              type="button"
              onClick={() => setStepEditor(null)}
              className="btn btn--text settings-overlay__back"
            >
              <Icon name="chevron-left" size={16} />
              <span>Back to steps</span>
            </button>
          ) : (
            <>
              {editingName ? (
                <input
                  autoFocus
                  className="settings-overlay__title-input"
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
                  className="settings-overlay__title-button"
                  onClick={() => setEditingName(true)}
                  title="Click to rename"
                >
                  <span id="test-settings-title" className="settings-overlay__title">
                    {data.name || "Untitled test"}
                  </span>
                  <Icon name="edit" size={16} className="settings-overlay__title-icon" />
                </button>
              )}
              <button
                type="button"
                className="icon-btn settings-overlay__close"
                onClick={handleClose}
                title="Close"
              >
                <Icon name="close" size={20} />
              </button>
            </>
          )
      }
    >
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
          ) : wide ? (
            <div className="settings-nav">
              <nav className="settings-nav__rail">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`settings-nav__item${activeSection === s.id ? " settings-nav__item--active" : ""}`}
                    onClick={() => setActiveSection(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </nav>
              <div className="settings-nav__pane">
                {(sections.find((s) => s.id === activeSection) ?? sections[0])?.content}
              </div>
            </div>
          ) : (
            <div className="settings-accordion-group">
              {sections.map((s) => (
                <Accordion
                  key={s.id}
                  title={s.label}
                  open={openAccordion === s.id}
                  onToggle={() => setOpenAccordion((cur) => (cur === s.id ? null : s.id))}
                >
                  {s.content}
                </Accordion>
              ))}
            </div>
          )}
    </SettingsOverlayShell>
  );
}
