"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSidebar, usePageTitle } from "@/components/SidebarProvider";
import type { Project, Report } from "@/lib/types";
import { trackReportCompletion } from "@/lib/electron";
import ErrorModal, { type ErrorModalDetails } from "@/components/ErrorModal";
import { buildRunErrorDetails } from "@/components/run-error-details";

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { refreshProjects, openProjectSettings } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);
  const [running, setRunning] = useState(false);
  // Structured run-failure payload (eyebrow / title / body / hint). Built
  // from the API's `issues` array via describeUrlIssues — see
  // lib/url-reachability.ts.
  const [runError, setRunError] = useState<ErrorModalDetails | null>(null);

  useEffect(() => {
    async function load() {
      const pRes = await fetch(`/api/projects/${params.id}`);
      if (pRes.ok) setProject(await pRes.json());

      const rRes = await fetch(`/api/projects/${params.id}/reports`);
      if (rRes.ok) {
        const reports: Report[] = await rRes.json();
        if (reports.length > 0) {
          router.replace(`/reports/${reports[0].id}`);
          return;
        }
      }
    }
    load();
  }, [params.id, router]);

  const hasTests = project && project.tests && project.tests.length > 0;

  const handleRun = async () => {
    setRunError(null);
    setRunning(true);
    const res = await fetch(`/api/projects/${params.id}/reports`, {
      method: "POST",
    });
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
            <div className="empty-state__actions" style={{ marginTop: "var(--space-5)" }}>
              <button
                onClick={handleRun}
                disabled={running}
                className="run-pill run-pill--lg"
              >
                {running ? "Starting..." : "Run"}
                <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
                  <path d="M8 5v18l16-9L8 5z" fill="currentColor" />
                </svg>
              </button>
              <button
                onClick={() => openProjectSettings(params.id)}
                className="btn btn--outline-soft"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
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
            <div className="empty-state__actions" style={{ marginTop: "var(--space-5)" }}>
              <button
                onClick={() => router.push(`/projects/${params.id}/settings/tests`)}
                className="btn btn--primary"
              >
                Add Test
              </button>
              <button
                onClick={() => openProjectSettings(params.id)}
                className="btn btn--outline-soft"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Settings
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
