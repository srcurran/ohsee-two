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

      // Only use saved path if user actually has projects
      const lastPath = localStorage.getItem("ohsee-last-path");
      if (lastPath && lastPath !== "/") {
        router.replace(lastPath);
        return;
      }

      setHasProjects(true);

      // Find the project with the most recent report
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
      <div className="flex h-full items-center justify-center">
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  if (!hasProjects && !loading) {
    return (
      <>
        <div className="flex h-full items-center justify-center px-[24px]">
          <div className="flex max-w-[480px] flex-col items-center gap-[24px] text-center">
            <div className="flex h-[64px] w-[64px] items-center justify-center rounded-[16px] bg-foreground/5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-foreground/60">
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="6" cy="7" r="0.5" fill="currentColor" />
                <circle cx="8" cy="7" r="0.5" fill="currentColor" />
                <circle cx="10" cy="7" r="0.5" fill="currentColor" />
              </svg>
            </div>
            <div>
              <h1 className="text-[28px] font-bold text-foreground">Get started with Ohsee</h1>
              <p className="mt-[12px] text-[15px] text-text-muted">
                Ohsee compares screenshots of your production and dev sites to catch visual regressions before they ship.
              </p>
            </div>
            <button
              onClick={() => setShowNewProject(true)}
              className="rounded-[12px] bg-foreground px-[28px] py-[12px] text-[15px] font-bold text-surface-content transition-all hover:-translate-y-[1px] hover:shadow-elevation-md"
            >
              Create your first project
            </button>
            <p className="text-[13px] text-text-muted/70">
              You&apos;ll add a production URL and a dev or staging URL. Ohsee handles the rest.
            </p>
          </div>
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
    <div className="flex h-full items-center justify-center">
      <p className="text-text-muted">Redirecting...</p>
    </div>
  );
}
