/** Owns the report-page server state: the report itself, its project, its
 * (optional) site test, and the sibling-reports list for the date dropdown.
 * Also runs the 3s poll while a report is `running` and exposes
 * `runNow`/`cancel` mutations. The page UI is a thin composition over this. */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { buildRunErrorDetails } from "@/components/settings/run-error-details";
import type { ErrorModalDetails } from "@/components/utility/ErrorModal";
import { trackReportCompletion } from "@/lib/electron";
import type { Project, Report, SiteTest } from "@/lib/types";
import { getDomain } from "@/components/index/utils/report";

interface UseReportDataArgs {
  reportId: string;
  /** Bumps the sidebar so its status dots refresh when a run finishes. */
  refreshProjects: () => void;
}

interface UseReportDataResult {
  report: Report | null;
  project: Project | null;
  siteTest: SiteTest | null;
  allReports: Report[];
  notFound: boolean;
  runError: ErrorModalDetails | null;
  setRunError: React.Dispatch<React.SetStateAction<ErrorModalDetails | null>>;
  runNow: () => Promise<void>;
  cancel: () => Promise<void>;
}

export function useReportData({
  reportId,
  refreshProjects,
}: UseReportDataArgs): UseReportDataResult {
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [allReports, setAllReports] = useState<Report[]>([]);
  const [siteTest, setSiteTest] = useState<SiteTest | null>(null);
  // Structured run-failure payload (eyebrow / title / body / hint). See
  // buildRunErrorDetails + lib/url-reachability.ts.
  const [runError, setRunError] = useState<ErrorModalDetails | null>(null);

  useEffect(() => {
    const loadReport = async () => {
      const res = await fetch(`/api/reports/${reportId}`);
      if (!res.ok) {
        setNotFound(true);
        return;
      }
      const r = await res.json();
      setReport(r);
      if (project) return;

      // Fire the project lookup and the sibling-reports lookup in
      // parallel — the second only needs r.projectId/siteTestId, not
      // the project object, so it doesn't need to wait. This used to
      // be three sequential round-trips and was the main reason the
      // report page filled in slot-by-slot.
      const reportsUrl = r.siteTestId
        ? `/api/projects/${r.projectId}/tests/${r.siteTestId}/reports`
        : `/api/projects/${r.projectId}/reports`;
      const [pRes, allRes] = await Promise.all([
        fetch(`/api/projects/${r.projectId}`),
        fetch(reportsUrl),
      ]);
      if (pRes.ok) {
        const p = await pRes.json();
        setProject(p);
        if (r.siteTestId && p.tests) {
          const test = p.tests.find((t: SiteTest) => t.id === r.siteTestId);
          if (test) setSiteTest(test);
        }
      }
      if (allRes.ok) setAllReports(await allRes.json());
    };
    loadReport();
    const interval = setInterval(async () => {
      const res = await fetch(`/api/reports/${reportId}`);
      if (res.ok) {
        const r = await res.json();
        setReport((prev) => {
          if (prev?.status === "running" && r.status !== "running") {
            refreshProjects();
          }
          return r;
        });
        if (r.status !== "running") clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, refreshProjects]);

  const runNow = async () => {
    if (!project) return;
    setRunError(null);
    const url = report?.siteTestId
      ? `/api/projects/${project.id}/tests/${report.siteTestId}/reports`
      : `/api/projects/${project.id}/reports`;
    const res = await fetch(url, { method: "POST" });
    if (res.ok) {
      const { reportId: newReportId } = await res.json();
      trackReportCompletion(
        newReportId,
        project.name || getDomain(project.prodUrl),
      );
      refreshProjects();
      router.push(`/reports/${newReportId}`);
    } else {
      setRunError(
        buildRunErrorDetails(await res.json().catch(() => null), project.id),
      );
    }
  };

  const cancel = async () => {
    const res = await fetch(`/api/reports/${reportId}`, { method: "DELETE" });
    if (res.ok) {
      setReport((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
      refreshProjects();
    }
  };

  return {
    report,
    project,
    siteTest,
    allReports,
    notFound,
    runError,
    setRunError,
    runNow,
    cancel,
  };
}
