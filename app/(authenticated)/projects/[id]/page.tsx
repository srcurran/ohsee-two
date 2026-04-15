"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSidebar } from "@/components/SidebarProvider";
import ProjectSettingsPanel from "@/components/ProjectSettingsPanel";
import type { Project, Report } from "@/lib/types";

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { refreshProjects } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);
  const [running, setRunning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"general" | "tests" | "advanced">("general");

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

  const hasTests = project && project.tests && project.tests.length > 0;

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

  const displayName = project.name || project.prodUrl.replace(/^https?:\/\//, "").replace(/^www\./, "");

  return (
    <>
      <div className="flex h-full flex-col items-center justify-center gap-[24px]">
        <div className="text-center">
          <h1 className="text-[24px] font-bold text-foreground">{displayName}</h1>
          {hasTests ? (
            <>
              <p className="mt-[8px] text-[14px] text-text-muted">
                No reports yet. Run your first comparison.
              </p>
              <div className="mt-[20px] flex items-center justify-center gap-[12px]">
                <button
                  onClick={handleRun}
                  disabled={running}
                  className="flex items-center gap-[12px] rounded-full border border-border-strong px-[24px] py-[12px] text-[18px] text-foreground transition-all hover:bg-surface-tertiary hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50"
                >
                  {running ? "Starting..." : "Run"}
                  <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
                    <path d="M8 5v18l16-9L8 5z" fill="currentColor" />
                  </svg>
                </button>
                <button
                  onClick={() => { setSettingsTab("general"); setShowSettings(true); }}
                  className="flex items-center gap-[8px] rounded-full border border-border-primary px-[20px] py-[12px] text-[14px] text-text-muted transition-all hover:bg-surface-tertiary hover:text-foreground"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  Settings
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-[8px] text-[14px] text-text-muted">
                Add a site test to start comparing.
              </p>
              <div className="mt-[20px] flex items-center justify-center gap-[12px]">
                <button
                  onClick={() => { setSettingsTab("tests"); setShowSettings(true); }}
                  className="rounded-[12px] bg-foreground px-[28px] py-[10px] text-[16px] font-bold text-surface-content transition-all hover:shadow-elevation-md hover:-translate-y-[1px]"
                >
                  Add Test
                </button>
                <button
                  onClick={() => { setSettingsTab("general"); setShowSettings(true); }}
                  className="flex items-center gap-[8px] rounded-full border border-border-primary px-[20px] py-[10px] text-[14px] text-text-muted transition-all hover:bg-surface-tertiary hover:text-foreground"
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

      {showSettings && (
        <ProjectSettingsPanel
          projectId={params.id}
          initialTab={settingsTab}
          onClose={() => {
            setShowSettings(false);
            // Refresh project data in case tests were added
            fetch(`/api/projects/${params.id}`)
              .then((r) => r.json())
              .then(setProject);
            refreshProjects();
          }}
        />
      )}
    </>
  );
}
