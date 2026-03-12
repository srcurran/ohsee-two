import { NextResponse } from "next/server";
import { readJsonFile, writeJsonFile } from "@/lib/data";
import { userReportsDir } from "@/lib/constants";
import { requireUserId } from "@/lib/auth-helpers";
import { cancelReport } from "@/lib/report-runner";
import type { Report } from "@/lib/types";
import path from "path";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const userId = await requireUserId();
    const { reportId } = await params;
    const reportPath = path.join(userReportsDir(userId), reportId, "report.json");
    const report = await readJsonFile<Report | null>(reportPath, null);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(report);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const userId = await requireUserId();
    const { reportId } = await params;
    const reportPath = path.join(userReportsDir(userId), reportId, "report.json");
    const report = await readJsonFile<Report | null>(reportPath, null);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Signal the in-process runner to stop
    const wasCancelled = cancelReport(reportId);

    // If the runner wasn't found in memory (e.g. server restarted),
    // mark it as cancelled directly
    if (!wasCancelled && report.status === "running") {
      report.status = "cancelled";
      await writeJsonFile(reportPath, report);
    }

    return NextResponse.json({ cancelled: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
