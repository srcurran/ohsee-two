import { NextResponse } from "next/server";
import { readJsonFile } from "@/lib/data";
import { userReportsDir } from "@/lib/constants";
import { requireUserId, handleApiError } from "@/lib/auth-helpers";
import type { Report } from "@/lib/types";
import path from "path";
import { promises as fs } from "fs";

// Reports are run through the test-scoped endpoint
// (POST /api/projects/[id]/tests/[testId]/reports); this route only lists a
// project's reports. The old project-level POST was removed — every report
// now belongs to a site test.
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
