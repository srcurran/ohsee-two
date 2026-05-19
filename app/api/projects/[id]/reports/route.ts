import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { readJsonFile, writeJsonFile } from "@/lib/data";
import { userReportsDir, BREAKPOINTS } from "@/lib/constants";
import { requireUserId, handleApiError } from "@/lib/auth-helpers";
import { runReport, cancelRunningReportsForProject } from "@/lib/report-runner";
import { readProjectsWithMigration } from "@/lib/site-test-migration";
import { checkProjectUrlsReachable } from "@/lib/url-reachability";
import { getTestSteps } from "@/lib/test-steps";
import type { Report } from "@/lib/types";
import path from "path";
import { promises as fs } from "fs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const reportsDir = userReportsDir(userId);
    let reports: Report[] = [];
    try {
      const dirs = await fs.readdir(reportsDir);
      // Read every report.json concurrently — sequential awaits used
      // to scale N×fs-latency. A null per missing/invalid file lets
      // us flatten with .filter() at the end.
      const read = await Promise.all(
        dirs.map(async (dir) => {
          const reportPath = path.join(reportsDir, dir, "report.json");
          try {
            const report = await readJsonFile<Report>(reportPath, null as unknown as Report);
            return report && report.projectId === id ? report : null;
          } catch {
            return null;
          }
        }),
      );
      reports = read.filter((r): r is Report => r !== null);
    } catch {
      // reports dir doesn't exist yet
    }

    reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return NextResponse.json(reports);
  } catch (err) {
    return handleApiError(err, "report");
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const projects = await readProjectsWithMigration(userId);
    const project = projects.find((p) => p.id === id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Use the first/default test if available
    const siteTest = project.tests?.[0];

    // Preflight: confirm both URLs are reachable before we spin up a report.
    // Without this the runner happily proceeds against an unreachable host
    // (e.g. https://localhost typo'd against an http-only dev server),
    // produces zero usable screenshots, and ends in "completed" — see
    // lib/url-reachability.ts for the failure modes we surface.
    const reachable = await checkProjectUrlsReachable(project.prodUrl, project.devUrl);
    if (!reachable.ok) {
      // `issues` is the structured field the client (buildRunErrorDetails)
      // actually reads. `error` is the legacy single-string fallback.
      return NextResponse.json(
        { error: reachable.error, issues: reachable.issues },
        { status: 400 },
      );
    }

    // Cancel any running reports for this project before starting a new one
    cancelRunningReportsForProject(id);

    const reportId = uuidv4();
    const bpCount = project.breakpoints?.length || BREAKPOINTS.length;
    // Progress estimate: one capture per URL step × breakpoint × ~3 phases.
    // Use the unified getTestSteps so tests with the new `steps[]` shape
    // count correctly (their legacy `pages` field is empty). Fall back to
    // project.pages for projects that have no test at all.
    const urlStepCount = siteTest
      ? getTestSteps(siteTest).filter((s) => s.type === "url").length
      : project.pages.length;
    const totalOps = urlStepCount * bpCount * 3;
    const report: Report = {
      id: reportId,
      projectId: id,
      ...(siteTest ? { siteTestId: siteTest.id } : {}),
      createdAt: new Date().toISOString(),
      status: "running",
      progress: { completed: 0, total: totalOps },
      pages: [],
    };

    const reportDir = path.join(userReportsDir(userId), reportId);
    await writeJsonFile(path.join(reportDir, "report.json"), report);

    // Run report asynchronously
    runReport(project, reportId, userId, siteTest).catch(console.error);

    return NextResponse.json({ reportId }, { status: 202 });
  } catch (err) {
    return handleApiError(err, "report");
  }
}
