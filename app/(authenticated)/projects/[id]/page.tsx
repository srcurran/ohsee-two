"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSidebar, usePageTitle } from "@/components/utility/SidebarProvider";
import type { Project, Report } from "@/lib/types";
import { trackReportCompletion } from "@/lib/electron";
import ErrorModal, { type ErrorModalDetails } from "@/components/utility/ErrorModal";
import { buildRunErrorDetails } from "@/components/index/runErrorDetails";
import { Icon } from "@/components/utility/Icon";
import { resolveScriptCredentials, resolveVaultCredentials } from "@/lib/vault-resolve";

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { refreshProjects, openProjectSettings, openNewTestWizard } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);
  const [running, setRunning] = useState(false);
  // Structured run-failure payload (eyebrow / title / body / hint). Built
  // from the API's `issues` array via describeUrlIssues — see
  // lib/url-reachability.ts.
  const [runError, setRunError] = useState<ErrorModalDetails | null>(null);

  useEffect(() => {
    async function load() {
      // The reports list lookup only needs params.id, not the project
      // body — fire both fetches in parallel.
      const [pRes, rRes] = await Promise.all([
        fetch(`/api/projects/${params.id}`),
        fetch(`/api/projects/${params.id}/reports`),
      ]);
      if (pRes.ok) setProject(await pRes.json());
      if (rRes.ok) {
        const reports: Report[] = await rRes.json();
        if (reports.length > 0) {
          router.replace(`/reports/${reports[0].id}`);
        }
      }
    }
    load();
  }, [params.id, router]);

  const hasTests = project && project.tests && project.tests.length > 0;

  const handleRun = async () => {
    setRunError(null);
    setRunning(true);
    // Reports are run through the test-scoped endpoint — this landing page runs
    // the project's first/default test. (hasTests guards the button, so a test
    // exists here.)
    const test = project?.tests?.[0];
    if (!test) {
      setRunError(
        buildRunErrorDetails({ error: "This project has no test to run." }, params.id),
      );
      setRunning(false);
      return;
    }
    // Resolve vault credentials client-side: `scriptCredentials` for
    // $EMAIL$/$PASSWORD$/$OTP$ in the test's script, `authCredentials` for the
    // test's sign-in profile so the runner logs in fresh at run start instead
    // of reusing a stale session.
    const scriptCredentials = await resolveScriptCredentials(test);
    const authProfile = test.authProfileId
      ? project?.authProfiles?.find((p) => p.id === test.authProfileId)
      : undefined;
    const authCredentials = await resolveVaultCredentials(authProfile?.vaultEntryId);
    const runOpts: RequestInit = { method: "POST" };
    if (scriptCredentials || authCredentials) {
      runOpts.headers = { "Content-Type": "application/json" };
      runOpts.body = JSON.stringify({ scriptCredentials, authCredentials });
    }
    const res = await fetch(`/api/projects/${params.id}/tests/${test.id}/reports`, runOpts);
    if (res.ok) {
      const { reportId } = await res.json();
      trackReportCompletion(reportId, displayName ?? "Audit");
      refreshProjects();
      router.push(`/reports/${reportId}`);
    } else {
      setRunError(buildRunErrorDetails(await res.json().catch(() => null), params.id));
    }
    setRunning(false);
  };

  const displayName = project
    ? project.name || project.prodUrl.replace(/^https?:\/\//, "").replace(/^www\./, "")
    : null;
  usePageTitle(displayName);

  if (!project) {
    return (
      <div className="center" style={{ height: "100%" }}>
        <p className="loader-text">Loading...</p>
      </div>
    );
  }

  return (
    <div className="empty-state">
      <div>
        <h1 className="empty-state__title">{displayName}</h1>
        {hasTests ? (
          <>
            <p className="empty-state__body">
              No reports yet. Run your first comparison.
            </p>
            <div className="row row--center" style={{ marginTop: "var(--space-5)" }}>
              <button
                onClick={handleRun}
                disabled={running}
                className="run-button run-button--lg"
              >
                {running ? "Starting..." : "Run"}
                <Icon name="play" size={24} />
              </button>
              <button
                onClick={() => openProjectSettings(params.id)}
                className="btn btn--outline-soft"
              >
                <Icon name="settings" size={16} />
                Settings
              </button>
            </div>
            <ErrorModal error={runError} onClose={() => setRunError(null)} />
          </>
        ) : (
          <>
            <p className="empty-state__body">
              Add a site test to start comparing.
            </p>
            <div className="row row--center" style={{ marginTop: "var(--space-5)" }}>
              <button
                onClick={() => openNewTestWizard(params.id)}
                className="btn btn--primary"
              >
                Add Test
              </button>
              <button
                onClick={() => openProjectSettings(params.id)}
                className="btn btn--outline-soft"
              >
                <Icon name="settings" size={16} />
                Settings
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
