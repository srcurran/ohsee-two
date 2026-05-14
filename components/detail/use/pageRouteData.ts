import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, Report } from "@/lib/types";

interface UsePageRouteDataResult {
  report: Report | null;
  project: Project | null;
  allReports: Report[];
}

/** Loads the active report, its parent project, and the project's full report
 * list for the report-navigation dropdown. If the report fetch 404s we clear
 * the saved last-path so the home redirect doesn't bounce back here, then
 * push the user to `/`. */
export function usePageRouteData(reportId: string): UsePageRouteDataResult {
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [allReports, setAllReports] = useState<Report[]>([]);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/reports/${reportId}`);
      if (!res.ok) {
        setNotFound(true);
        return;
      }
      const r = await res.json();
      if (!r || !Array.isArray(r.pages)) return;
      setReport(r);

      // Parallel: the sibling-reports list only needs r.projectId, not
      // the project object — so fire both at once instead of chaining.
      const [pRes, reportsRes] = await Promise.all([
        fetch(`/api/projects/${r.projectId}`),
        fetch(`/api/projects/${r.projectId}/reports`),
      ]);
      if (pRes.ok) setProject(await pRes.json());
      if (reportsRes.ok) setAllReports(await reportsRes.json());
    };
    load();
  }, [reportId]);

  useEffect(() => {
    if (notFound) {
      localStorage.removeItem("ohsee-last-path");
      router.replace("/");
    }
  }, [notFound, router]);

  return { report, project, allReports };
}
