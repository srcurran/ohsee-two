"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, Report } from "@/lib/types";
import { useSidebar } from "@/components/SidebarProvider";
import NewProjectOverlay from "@/components/NewProjectOverlay";

export default function Home() {
  const router = useRouter();
  const { refreshProjects } = useSidebar();
  const [loading, setLoading] = useState(true);
  const [hasProjects, setHasProjects] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);

  useEffect(() => {
    async function redirectToLatest() {
      const res = await fetch("/api/projects");
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const projects: Project[] = await res.json();
      if (projects.length === 0) {
        localStorage.removeItem("ohsee-last-path");
        setLoading(false);
        setHasProjects(false);
        return;
      }

      const lastPath = localStorage.getItem("ohsee-last-path");
      if (lastPath && lastPath !== "/") {
        router.replace(lastPath);
        return;
      }

      setHasProjects(true);

      let latestReportId: string | null = null;
      let latestDate = 0;
      let firstProjectId: string | null = null;

      for (const project of projects) {
        if (!firstProjectId) firstProjectId = project.id;
        const rRes = await fetch(`/api/projects/${project.id}/reports`);
        if (rRes.ok) {
          const reports: Report[] = await rRes.json();
          if (reports.length > 0) {
            const reportDate = new Date(reports[0].createdAt).getTime();
            if (reportDate > latestDate) {
              latestDate = reportDate;
              latestReportId = reports[0].id;
            }
          }
        }
      }

      if (latestReportId) {
        router.replace(`/reports/${latestReportId}`);
      } else {
        router.replace(`/projects/${firstProjectId}`);
      }
    }
    redirectToLatest();
  }, [router]);

  if (loading && hasProjects) {
    return (
      <div className="center" style={{ height: "100%" }}>
        <p className="loader-text">Loading...</p>
      </div>
    );
  }

  if (!hasProjects && !loading) {
    return (
      <>
        <div className="empty-state empty-state--flush">
          <div className="empty-state__badge">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="6" cy="7" r="0.5" fill="currentColor" />
              <circle cx="8" cy="7" r="0.5" fill="currentColor" />
              <circle cx="10" cy="7" r="0.5" fill="currentColor" />
            </svg>
          </div>
          <div>
            <h1 className="empty-state__title">Get started with Ohsee</h1>
            <p className="empty-state__body">
              Ohsee compares screenshots of your production and dev sites to catch visual regressions before they ship.
            </p>
          </div>
          <button onClick={() => setShowNewProject(true)} className="btn btn--primary">
            Create your first project
          </button>
          <p className="empty-state__footnote">
            You&apos;ll add a production URL and a dev or staging URL. Ohsee handles the rest.
          </p>
        </div>

        {showNewProject && (
          <NewProjectOverlay
            onClose={() => setShowNewProject(false)}
            onCreated={(projectId) => {
              setShowNewProject(false);
              refreshProjects();
              router.push(`/projects/${projectId}`);
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="center" style={{ height: "100%" }}>
      <p className="loader-text">Redirecting...</p>
    </div>
  );
}
