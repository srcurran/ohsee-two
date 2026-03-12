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
      // Check localStorage for last viewed route
      const lastPath = localStorage.getItem("ohsee-last-path");
      if (lastPath && lastPath !== "/") {
        router.replace(lastPath);
        return;
      }

      const res = await fetch("/api/projects");
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const projects: Project[] = await res.json();
      if (projects.length === 0) {
        setLoading(false);
        setHasProjects(false);
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
        <p className="text-black/50">Loading...</p>
      </div>
    );
  }

  if (!hasProjects && !loading) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center gap-[24px]">
          <div className="text-center">
            <h1 className="text-[24px] font-bold text-black">Welcome to OHSEE</h1>
            <p className="mt-[8px] text-[14px] text-black/50">
              Visual regression testing for your websites.
            </p>
          </div>
          <button
            onClick={() => setShowNewProject(true)}
            className="rounded-[10px] bg-black px-[32px] py-[12px] text-[16px] font-bold text-white"
          >
            Create your first project
          </button>
        </div>

        {showNewProject && (
          <NewProjectOverlay
            onClose={() => setShowNewProject(false)}
            onCreated={() => {
              setShowNewProject(false);
              refreshProjects();
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-black/50">Redirecting...</p>
    </div>
  );
}
