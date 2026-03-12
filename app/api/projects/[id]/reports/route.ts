import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { readJsonFile, writeJsonFile } from "@/lib/data";
import { userProjectsFile, userReportsDir, BREAKPOINTS } from "@/lib/constants";
import { requireUserId } from "@/lib/auth-helpers";
import { runReport, cancelRunningReportsForProject } from "@/lib/report-runner";
import type { Project, Report } from "@/lib/types";
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
    const projects = await readJsonFile<Project[]>(userProjectsFile(userId), []);
    const project = projects.find((p) => p.id === id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Cancel any running reports for this project before starting a new one
    cancelRunningReportsForProject(id);

    const reportId = uuidv4();
    const totalOps = project.pages.length * BREAKPOINTS.length * 3;
    const report: Report = {
      id: reportId,
      projectId: id,
      createdAt: new Date().toISOString(),
      status: "running",
      progress: { completed: 0, total: totalOps },
      pages: [],
    };

    const reportDir = path.join(userReportsDir(userId), reportId);
    await writeJsonFile(path.join(reportDir, "report.json"), report);

    // Run report asynchronously
    runReport(project, reportId, userId).catch(console.error);

    return NextResponse.json({ reportId }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
