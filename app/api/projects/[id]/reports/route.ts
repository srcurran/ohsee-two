import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { readJsonFile, writeJsonFile } from "@/lib/data";
import { PROJECTS_FILE, REPORTS_DIR } from "@/lib/constants";
import { runReport } from "@/lib/report-runner";
import type { Project, Report } from "@/lib/types";
import path from "path";
import { promises as fs } from "fs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Scan reports directory for reports belonging to this project
  const reports: Report[] = [];
  try {
    const dirs = await fs.readdir(REPORTS_DIR);
    for (const dir of dirs) {
      const reportPath = path.join(REPORTS_DIR, dir, "report.json");
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
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projects = await readJsonFile<Project[]>(PROJECTS_FILE, []);
  const project = projects.find((p) => p.id === id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const reportId = uuidv4();
  const report: Report = {
    id: reportId,
    projectId: id,
    createdAt: new Date().toISOString(),
    status: "running",
    pages: [],
  };

  const reportDir = path.join(REPORTS_DIR, reportId);
  await writeJsonFile(path.join(reportDir, "report.json"), report);

  // Run report asynchronously
  runReport(project, reportId).catch(console.error);

  return NextResponse.json({ reportId }, { status: 202 });
}
