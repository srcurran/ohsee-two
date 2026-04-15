import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { readJsonFile, writeJsonFile } from "@/lib/data";
import { userProjectsFile, userReportsDir, BREAKPOINTS } from "@/lib/constants";
import { requireUserId } from "@/lib/auth-helpers";
import { runReport, cancelRunningReportsForProject } from "@/lib/report-runner";
import { readProjectsWithMigration } from "@/lib/site-test-migration";
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
    const reports: Report[] = [];
    try {
      const dirs = await fs.readdir(reportsDir);
      for (const dir of dirs) {
        const reportPath = path.join(reportsDir, dir, "report.json");
        try {
          const report = await readJsonFile<Report>(reportPath, null as unknown as Report);
          if (report && report.projectId === id && report.siteTestId === testId) {
            reports.push(report);
          }
        } catch {
          // skip invalid
        }
      }
    } catch {
      // reports dir doesn't exist yet
    }
    reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return NextResponse.json(reports);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/** POST /api/projects/[id]/tests/[testId]/reports — run a specific test */
export async function POST(
  _request: Request,
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

    cancelRunningReportsForProject(id);

    const reportId = uuidv4();
    const bpCount = project.breakpoints?.length || BREAKPOINTS.length;
    const totalOps = siteTest.pages.length * bpCount * 3;
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

    runReport(project, reportId, userId, siteTest).catch(console.error);

    return NextResponse.json({ reportId }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
