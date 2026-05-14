import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Project, Report } from "@/lib/types";
import {
  type ProjectWithReports,
  sortByProjectOrder,
} from "@/components/utility/utils/sidebar";

interface UseSidebarDataArgs {
  /** Bumped by `SidebarProvider.refreshProjects()` to force a refetch. */
  refreshKey: number;
  /** Called periodically while at least one report is `status: "running"`. */
  refreshProjects: () => void;
}

interface UseSidebarDataResult {
  data: ProjectWithReports[];
  setData: React.Dispatch<React.SetStateAction<ProjectWithReports[]>>;
  /** True until the first fetch completes — lets the rail render a
   * skeleton/empty state instead of a misleading "+ Add new site"
   * CTA while data is in flight. */
  loading: boolean;
}

/** Owns the sidebar's project + reports data: initial fetch, refresh-driven
 * refetch, and a 3s poll while any report is running. Drag-reorder updates
 * happen via the exposed `setData` setter (kept here so the data and its
 * mutator stay co-located). */
export function useSidebarData({
  refreshKey,
  refreshProjects,
}: UseSidebarDataArgs): UseSidebarDataResult {
  const [data, setData] = useState<ProjectWithReports[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [projRes, settingsRes] = await Promise.all([
        fetch("/api/projects", { cache: "no-store" }),
        fetch("/api/settings", { cache: "no-store" }),
      ]);
      if (!projRes.ok || cancelled) {
        if (!cancelled) setLoading(false);
        return;
      }
      const projects: Project[] = await projRes.json();
      const settings = settingsRes.ok ? await settingsRes.json() : {};
      const projectOrder: string[] = settings.projectOrder || [];

      const items = await Promise.all(
        projects.map(async (project) => {
          const rRes = await fetch(`/api/projects/${project.id}/reports`, {
            cache: "no-store",
          });
          const reports: Report[] = rRes.ok ? await rRes.json() : [];
          return { project, reports };
        }),
      );
      if (cancelled) return;

      setData(sortByProjectOrder(items, projectOrder));
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // Live-poll while a report is in flight so the sidebar dots update.
  // Skipped while the user is on /reports/* — useReportData polls the
  // individual report there and calls refreshProjects() on the
  // running → terminal transition, so this would double up.
  const pathname = usePathname();
  const onReportPage = !!pathname && pathname.startsWith("/reports/");
  const hasRunningReport = data.some(({ reports }) =>
    reports.some((r) => r.status === "running"),
  );
  useEffect(() => {
    if (!hasRunningReport || onReportPage) return;
    const interval = setInterval(refreshProjects, 3000);
    return () => clearInterval(interval);
  }, [hasRunningReport, onReportPage, refreshProjects]);

  return { data, setData, loading };
}
