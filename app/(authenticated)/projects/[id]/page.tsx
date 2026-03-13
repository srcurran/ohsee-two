"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSidebar } from "@/components/SidebarProvider";
import NewProjectOverlay from "@/components/NewProjectOverlay";
import type { Project, Report } from "@/lib/types";

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { refreshProjects } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);
  const [running, setRunning] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);

  useEffect(() => {
    async function load() {
      // Load project info
      const pRes = await fetch(`/api/projects/${params.id}`);
      if (pRes.ok) setProject(await pRes.json());

      // Try to redirect to latest report
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

  const handleRun = async () => {
    setRunning(true);
    const res = await fetch(`/api/projects/${params.id}/reports`, {
      method: "POST",
    });
    if (res.ok) {
      const { reportId } = await res.json();
      refreshProjects();
      router.push(`/reports/${reportId}`);
    }
    setRunning(false);
  };

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  const displayUrl = project.prodUrl.replace(/^https?:\/\//, "").replace(/^www\./, "");

  // If we're still here, the project has no reports
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[24px]">
      <div className="text-center">
        <h1 className="text-[24px] font-bold text-foreground">{displayUrl}</h1>
        <p className="mt-[8px] text-[14px] text-text-muted">
          No reports yet. Run your first comparison.
        </p>
      </div>
      <button
        onClick={handleRun}
        disabled={running}
        className="flex items-center gap-[16px] rounded-full border border-border-strong px-[24px] py-[12px] text-[20px] text-foreground transition-all hover:bg-surface-tertiary hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50"
      >
        {running ? "Starting..." : "Run"}
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M8 5v18l16-9L8 5z" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
