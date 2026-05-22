/** Owns the report-page server state: the report itself, its project, its
 * (optional) site test, and the sibling-reports list for the date dropdown.
 * Also runs the 3s poll while a report is `running` and exposes
 * `runNow`/`cancel` mutations. The page UI is a thin composition over this. */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buildRunErrorDetails } from "@/components/settings/run-error-details";
import type { ErrorModalDetails } from "@/components/utility/ErrorModal";
import { getOhsee, trackReportCompletion } from "@/lib/electron";
import type { Project, Report, SiteTest } from "@/lib/types";
import { getDomain } from "@/components/index/utils/report";
import { resolveScriptCredentials } from "@/lib/vault-resolve";

interface UseReportDataArgs {
  reportId: string;
  /** Bumps the sidebar so its status dots refresh when a run finishes. */
  refreshProjects: () => void;
  /** Incremented by SidebarProvider.refreshProjects() — drives a re-fetch
   *  of project + siteTest so settings edits (like name changes) are
   *  reflected without a full page reload. */
  refreshKey: number;
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
  refreshKey,
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
            // Refresh the sibling-reports list so the dropdown dot
            // and timestamp stay in sync with the header.
            const reportsUrl = r.siteTestId
              ? `/api/projects/${r.projectId}/tests/${r.siteTestId}/reports`
              : `/api/projects/${r.projectId}/reports`;
            fetch(reportsUrl)
              .then((allRes) => (allRes.ok ? allRes.json() : null))
              .then((all) => { if (all) setAllReports(all); });
          }
          return r;
        });
        if (r.status !== "running") clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, refreshProjects]);

  // Re-fetch project + siteTest when the sidebar data refreshes (e.g.
  // after renaming a test in the settings overlay). Uses a ref to read
  // the current report without adding it as a dependency — we only want
  // this effect to fire on refreshKey changes, not on every report poll.
  const reportRef = useRef(report);
  reportRef.current = report;
  const initialRefreshKey = useRef(refreshKey);
  useEffect(() => {
    // Skip the initial mount — the main effect already loads the project.
    if (refreshKey === initialRefreshKey.current) return;
    const r = reportRef.current;
    if (!r?.projectId) return;
    let cancelled = false;
    (async () => {
      const reportsUrl = r.siteTestId
        ? `/api/projects/${r.projectId}/tests/${r.siteTestId}/reports`
        : `/api/projects/${r.projectId}/reports`;
      const [pRes, allRes] = await Promise.all([
        fetch(`/api/projects/${r.projectId}`),
        fetch(reportsUrl),
      ]);
      if (cancelled) return;
      if (pRes.ok) {
        const p = await pRes.json();
        setProject(p);
        if (r.siteTestId && p.tests) {
          const test = p.tests.find((t: SiteTest) => t.id === r.siteTestId);
          if (test) setSiteTest(test);
        }
      }
      if (allRes.ok) setAllReports(await allRes.json());
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const runNow = async () => {
    if (!project) return;
    setRunError(null);

    // Resolve vault credentials for $EMAIL$ / $PASSWORD$ / $OTP$
    // interpolation in Playwright script steps.
    const scriptCredentials = await resolveScriptCredentials(siteTest);

    // Always run through the test-scoped endpoint. Reports created before
    // the test system carry no siteTestId — fall back to the project's
    // first/default test (what such a run would resolve to anyway).
    const testId = report?.siteTestId ?? project.tests?.[0]?.id;
    if (!testId) {
      setRunError(
        buildRunErrorDetails(
          { error: "This project has no test to run." },
          project.id,
        ),
      );
      return;
    }
    const url = `/api/projects/${project.id}/tests/${testId}/reports`;
    const fetchOpts: RequestInit = { method: "POST" };
    if (scriptCredentials) {
      fetchOpts.headers = { "Content-Type": "application/json" };
      fetchOpts.body = JSON.stringify({ scriptCredentials });
    }
    const res = await fetch(url, fetchOpts);
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
