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
    fetch(`/api/reports/${reportId}`)
      .then((res) => {
        if (!res.ok) {
          setNotFound(true);
          return null;
        }
        return res.json();
      })
      .then((r) => {
        if (!r || !Array.isArray(r.pages)) return;
        setReport(r);
        fetch(`/api/projects/${r.projectId}`)
          .then((pr) => pr.json())
          .then((p) => {
            setProject(p);
            fetch(`/api/projects/${p.id}/reports`)
              .then((res) => res.json())
              .then((reports) => setAllReports(reports));
          });
      });
  }, [reportId]);

  useEffect(() => {
    if (notFound) {
      localStorage.removeItem("ohsee-last-path");
      router.replace("/");
    }
  }, [notFound, router]);

  return { report, project, allReports };
}
