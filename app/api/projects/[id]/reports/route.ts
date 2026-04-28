import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { readJsonFile, writeJsonFile } from "@/lib/data";
import { userReportsDir, BREAKPOINTS } from "@/lib/constants";
import { requireUserId } from "@/lib/auth-helpers";
import { runReport, cancelRunningReportsForProject } from "@/lib/report-runner";
import { readProjectsWithMigration } from "@/lib/site-test-migration";
import { checkProjectUrlsReachable } from "@/lib/url-reachability";
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
    const reports: Report[] = [];
    try {
      const dirs = await fs.readdir(reportsDir);
      for (const dir of dirs) {
        const reportPath = path.join(reportsDir, dir, "report.json");
        try {
          const report = await readJsonFile<Report>(reportPath, null as unknown as Report);
          if (report && report.projectId === id) {
            reports.push(report);
          }
        } catch {
          // skip invalid report files
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
      return NextResponse.json(
        { error: reachable.error, prod: reachable.prod, dev: reachable.dev },
        { status: 400 },
      );
    }

    // Cancel any running reports for this project before starting a new one
    cancelRunningReportsForProject(id);

    const reportId = uuidv4();
    const bpCount = project.breakpoints?.length || BREAKPOINTS.length;
    const pages = siteTest?.pages ?? project.pages;
    const totalOps = pages.length * bpCount * 3;
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
    // Distinguish auth failures from any other runtime error — otherwise a
    // throw inside the preflight or report scaffolding would mask itself as
    // an Unauthorized response and confuse the user.
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[reports POST] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start report" },
      { status: 500 },
    );
  }
}
