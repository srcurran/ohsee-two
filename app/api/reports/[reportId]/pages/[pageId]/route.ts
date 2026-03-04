import { NextResponse } from "next/server";
import { readJsonFile } from "@/lib/data";
import { REPORTS_DIR } from "@/lib/constants";
import type { Report } from "@/lib/types";
import path from "path";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string; pageId: string }> }
) {
  const { reportId, pageId } = await params;
  const reportPath = path.join(REPORTS_DIR, reportId, "report.json");
  const report = await readJsonFile<Report | null>(reportPath, null);
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const page = report.pages.find((p) => p.pageId === pageId);
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  return NextResponse.json(page);
}
