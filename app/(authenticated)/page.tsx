"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, Report } from "@/lib/types";
import { useSidebar } from "@/components/utility/SidebarProvider";
import { LoadingOverlay } from "@/components/utility/LoadingOverlay";
import { Icon } from "@/components/utility/Icon";

export default function Home() {
  const router = useRouter();
  const { openNewProjectWizard } = useSidebar();
  const [loading, setLoading] = useState(true);
  const [hasProjects, setHasProjects] = useState(false);

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

      // Fetch every project's reports in parallel. The previous
      // sequential await inside a for-loop blocked the redirect on
      // N × round-trip and was the main reason the initial "Loading..."
      // lingered for seconds.
      const reportFetches = await Promise.all(
        projects.map(async (project) => {
          const rRes = await fetch(`/api/projects/${project.id}/reports`);
          if (!rRes.ok) return { project, reports: [] as Report[] };
          const reports: Report[] = await rRes.json();
          return { project, reports };
        }),
      );

      let latestReportId: string | null = null;
      let latestDate = 0;
      for (const { reports } of reportFetches) {
        if (reports.length > 0) {
          const reportDate = new Date(reports[0].createdAt).getTime();
          if (reportDate > latestDate) {
            latestDate = reportDate;
            latestReportId = reports[0].id;
          }
        }
      }

      if (latestReportId) {
        router.replace(`/reports/${latestReportId}`);
      } else {
        router.replace(`/projects/${projects[0].id}`);
      }
    }
    redirectToLatest();
  }, [router]);

  // Loading or about to redirect: show the neutral overlay. Once the
  // destination route mounts its own LoadingOverlay we cross-fade
  // through that one's transition instead of this component's.
  if (loading) {
    return <LoadingOverlay ready={false} />;
  }

  if (!hasProjects) {
    // The titlebar settings gear (AppSettingsFlyout, rendered top-right in the
    // layout) is the entry point to app settings here too — it lives in the
    // titlebar, so it stays available even though the sidebar is hidden until
    // the first project exists.
    return (
      <div className="empty-state empty-state--flush">
        <div className="empty-state__badge">
          <Icon name="monitor" size={28} />
        </div>
        <div>
          <h1 className="empty-state__title">Get started with Ohsee</h1>
          <p className="empty-state__body">
            Ohsee compares screenshots of your production and dev sites to catch visual regressions before they ship.
          </p>
        </div>
        <button onClick={openNewProjectWizard} className="btn btn--primary">
          Create your first project
        </button>
        <p className="empty-state__footnote">
          You&apos;ll add a production URL and a dev or staging URL. Ohsee handles the rest.
        </p>
      </div>
    );
  }

  // Fallback (shouldn't normally render — redirect should have fired).
  return <LoadingOverlay ready={false} />;
}
