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

/** GET /api/projects/[id]/tests/[testId]/reports — list reports for a specific test */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; testId: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id, testId } = await params;
    const reportsDir = userReportsDir(userId);
    let reports: Report[] = [];
    try {
      const dirs = await fs.readdir(reportsDir);
      // Concurrent reads — see /api/projects/[id]/reports for the
      // same pattern.
      const read = await Promise.all(
        dirs.map(async (dir) => {
          const reportPath = path.join(reportsDir, dir, "report.json");
          try {
            const report = await readJsonFile<Report>(reportPath, null as unknown as Report);
            return report && report.projectId === id && report.siteTestId === testId
              ? report
              : null;
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

/** POST /api/projects/[id]/tests/[testId]/reports — run a specific test.
 *
 *  Optional JSON body `{ scriptCredentials }` — the client resolves
 *  vault credentials before the POST when the test uses template
 *  variables ($EMAIL$, $PASSWORD$, $OTP$) in Playwright scripts. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; testId: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id, testId } = await params;
    const projects = await readProjectsWithMigration(userId);
    const project = projects.find((p) => p.id === id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const siteTest = project.tests?.find((t) => t.id === testId);
    if (!siteTest) {
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    }

    // Parse optional body (may be empty for backwards-compat).
    let scriptCredentials: import("@/lib/types").ScriptCredentials | undefined;
    try {
      const body = await request.json();
      if (body?.scriptCredentials) scriptCredentials = body.scriptCredentials;
    } catch {
      // No body or non-JSON — fine, credentials are optional.
    }

    // Same preflight as the project-level route — see lib/url-reachability.ts.
    const reachable = await checkProjectUrlsReachable(project.prodUrl, project.devUrl);
    if (!reachable.ok) {
      // `issues` is the structured field the client (buildRunErrorDetails)
      // actually reads. `error` is the legacy single-string fallback.
      return NextResponse.json(
        { error: reachable.error, issues: reachable.issues },
        { status: 400 },
      );
    }

    cancelRunningReportsForProject(id);

    const reportId = uuidv4();
    const bpCount = project.breakpoints?.length || BREAKPOINTS.length;
    // Progress estimate: one capture per URL step × breakpoint × ~3 phases.
    // Use getTestSteps so tests written with the unified `steps[]` shape
    // (where `siteTest.pages` is empty) report a non-zero total instead
    // of immediate 100%.
    const urlStepCount = getTestSteps(siteTest).filter((s) => s.type === "url").length;
    const totalOps = urlStepCount * bpCount * 3;
    const report: Report = {
      id: reportId,
      projectId: id,
      siteTestId: testId,
      createdAt: new Date().toISOString(),
      status: "running",
      progress: { completed: 0, total: totalOps },
      pages: [],
    };

    const reportDir = path.join(userReportsDir(userId), reportId);
    await writeJsonFile(path.join(reportDir, "report.json"), report);

    runReport(project, reportId, userId, siteTest, { scriptCredentials }).catch(console.error);

    return NextResponse.json({ reportId }, { status: 202 });
  } catch (err) {
    return handleApiError(err, "report");
  }
}
