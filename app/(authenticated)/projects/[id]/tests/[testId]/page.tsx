"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Project, SiteTest } from "@/lib/types";
import { trackReportCompletion } from "@/lib/electron";
import ErrorModal, { type ErrorModalDetails } from "@/components/utility/ErrorModal";
import { buildRunErrorDetails } from "@/components/index/runErrorDetails";
import { useSidebar } from "@/components/utility/SidebarProvider";
import { Icon } from "@/components/utility/Icon";

export default function TestPage() {
  const params = useParams<{ id: string; testId: string }>();
  const router = useRouter();
  const { openTestSettings, openNewTestWizard } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);
  const [test, setTest] = useState<SiteTest | null>(null);
  const [running, setRunning] = useState(false);
  // Structured run-failure payload (eyebrow / title / body / hint). Built
  // by buildRunErrorDetails — see lib/url-reachability.ts for the
  // underlying preflight that produces these.
  const [runError, setRunError] = useState<ErrorModalDetails | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p);
        const t = p.tests?.find((t) => t.id === params.testId);
        setTest(t ?? null);
      });
  }, [params.id, params.testId]);

  const handleRun = async () => {
    setRunError(null);
    setRunning(true);
    const res = await fetch(
      `/api/projects/${params.id}/tests/${params.testId}/reports`,
      { method: "POST" }
    );
    if (res.ok) {
      const { reportId } = await res.json();
      const label = project && test
        ? `${project.name || project.prodUrl} / ${test.name}`
        : "Audit";
      trackReportCompletion(reportId, label);
      router.push(`/reports/${reportId}`);
    } else {
      setRunError(buildRunErrorDetails(await res.json().catch(() => null), params.id));
      setRunning(false);
    }
  };

  if (!project || !test) {
    return (
      <div className="center" style={{ height: "100%" }}>
        <p className="loader-text">Loading...</p>
      </div>
    );
  }

  // `steps` is the unified ordered list (URLs + microtests) that the new
  // wizard writes. Older tests still use the legacy pages/compositions/
  // flows fields, so check both.
  const hasSteps = (test.steps?.length ?? 0) > 0;
  const hasPages = test.pages.length > 0;
  const hasCompositions = (test.compositions?.length ?? 0) > 0;
  const hasFlows = (test.flows?.length ?? 0) > 0;
  const canRun = hasSteps || hasPages || hasCompositions || hasFlows;

  // A draft test hasn't finished the creation wizard — steer the user back
  // to finish it rather than offering a run/settings dead-end.
  if (test.draft) {
    return (
      <div className="empty-state">
        <h1 className="empty-state__title">{test.name}</h1>
        <p className="empty-state__body">
          This test isn&apos;t finished yet. Pick up where you left off.
        </p>
        <button
          onClick={() => openNewTestWizard(params.id, { testId: params.testId })}
          className="btn btn--primary"
        >
          Finish creating test
        </button>
      </div>
    );
  }

  return (
    <div className="empty-state">
      <h1 className="empty-state__title">{test.name}</h1>

      {canRun ? (
        <>
          <p className="empty-state__body">
            No reports yet. Run this test to capture your first set of screenshots.
          </p>
          <button
            onClick={handleRun}
            disabled={running}
            className="run-button"
          >
            {running ? "Starting..." : "Run now"}
            <Icon name="play" size={16} className="run-button__icon" />
          </button>
          <ErrorModal error={runError} onClose={() => setRunError(null)} />
        </>
      ) : (
        <p className="empty-state__body">
          This test has no pages, compositions, or flows configured yet.
          Add some in settings before running.
        </p>
      )}

      <button
        onClick={() => openTestSettings(params.id, params.testId)}
        className="btn btn--text"
      >
        Configure test settings
      </button>
    </div>
  );
}
