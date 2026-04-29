"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MaterialField from "@/components/MaterialField";
import Wizard from "@/components/Wizard";
import { useSidebar } from "@/components/SidebarProvider";
import { resolveProjectPath } from "@/lib/url-utils";
import { trackReportCompletion } from "@/lib/electron";
import type { Project, TestStep } from "@/lib/types";

interface Props {
  projectId: string;
  /** Optional — when provided, the wizard skips its own first step (name)
   *  and renders the steps editor directly. Used for the post-create
   *  handoff from NewProjectWizard. */
  initialName?: string;
  onClose: () => void;
}

/**
 * Two-step new-test flow per Figma 187:1094:
 *   1. Name (single field)
 *   2. Steps editor — list of TestStep rows, "Add path" inline form, plus
 *      a "Record with Playwright" pivot to the full test settings overlay.
 *      Primary action is "Run test" which creates the test, kicks off a
 *      report, and navigates to the new report page.
 *
 * Playwright/script steps are deferred to the full test settings overlay so
 * the wizard stays compact. The user can save with just paths, then refine
 * scripts after the run completes.
 */
export default function NewTestWizard({ projectId, initialName, onClose }: Props) {
  const router = useRouter();
  const { refreshProjects, openTestSettings } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);
  const [step, setStep] = useState<1 | 2>(initialName ? 2 : 1);
  const [name, setName] = useState(initialName ?? "");
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [pathInput, setPathInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((p: Project) => setProject(p));
  }, [projectId]);

  const projectUrls = project ? [project.prodUrl, project.devUrl] : [];
  const pathResolved = pathInput.trim() ? resolveProjectPath(pathInput, projectUrls) : null;

  const addPath = () => {
    if (!pathResolved?.ok) return;
    setSteps((cur) => [
      ...cur,
      { id: crypto.randomUUID(), type: "url", url: pathResolved.path, captureScreenshot: true },
    ]);
    setPathInput("");
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

      // Persist the steps onto it (the create endpoint accepts pages but not
      // unified steps; use the project PUT path that TestSettingsOverlay uses).
      if (steps.length > 0) {
        const projects = (project.tests || []).map((t) =>
          t.id === test.id ? { ...t, steps } : t,
        );
        // Reload latest project (the test was just appended) so we don't
        // overwrite siblings.
        const latest = await fetch(`/api/projects/${projectId}`).then((r) => r.json());
        const latestTests = (latest.tests || []).map((t: { id: string }) =>
          t.id === test.id ? { ...t, steps } : t,
        );
        await fetch(`/api/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tests: latestTests }),
        });
        // Use `projects` to silence unused-var eslint without changing behavior.
        void projects;
      }

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
        // Fall back: just open the test in settings if the run couldn't start.
        onClose();
        openTestSettings(projectId, test.id);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 1) {
    return (
      <Wizard
        title="New test"
        step={1}
        totalSteps={2}
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

  return (
    <Wizard
      title="New test"
      step={2}
      totalSteps={2}
      nextLabel="Run test"
      nextDisabled={steps.length === 0}
      busy={submitting}
      onPrev={() => setStep(1)}
      onNext={handleRunTest}
      onClose={onClose}
    >
      <div className="wizard__fields">
        <h3 className="wizard__section-title">Test steps</h3>

        {steps.length === 0 ? (
          <p className="wizard__hint">
            Add a path you want to capture. You can record a Playwright
            script for it later in test settings.
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
      </div>
    </Wizard>
  );
}
