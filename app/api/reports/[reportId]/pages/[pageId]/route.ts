import { NextResponse } from "next/server";
import { readJsonFile } from "@/lib/data";
import { userReportsDir } from "@/lib/constants";
import { requireUserId } from "@/lib/auth-helpers";
import type { Report } from "@/lib/types";
import path from "path";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string; pageId: string }> }
) {
  try {
    const userId = await requireUserId();
    const { reportId, pageId } = await params;
    const reportPath = path.join(userReportsDir(userId), reportId, "report.json");
    const report = await readJsonFile<Report | null>(reportPath, null);
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const page = report.pages.find((p) => p.pageId === pageId);
    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    return NextResponse.json(page);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
