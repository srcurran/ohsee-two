import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./constants";
import { readJsonFile, writeJsonFile } from "./data";
import type { Report } from "./types";

export async function recoverStaleReports(): Promise<number> {
  const usersDir = path.join(DATA_DIR, "users");
  let userDirs: string[];
  try {
    userDirs = await fs.readdir(usersDir);
  } catch {
    return 0;
  }

  let recovered = 0;

  for (const userId of userDirs) {
    const reportsDir = path.join(usersDir, userId, "reports");
    let reportDirs: string[];
    try {
      reportDirs = await fs.readdir(reportsDir);
    } catch {
      continue;
    }

    for (const reportId of reportDirs) {
      const reportPath = path.join(reportsDir, reportId, "report.json");
      const report = await readJsonFile<Report | null>(reportPath, null);
      if (report?.status === "running") {
        report.status = "failed";
        report.error = "Server restarted while report was running";
        await writeJsonFile(reportPath, report);
        recovered++;
        console.log(`Recovered stale report ${reportId} (user: ${userId})`);
      }
    }
  }

  return recovered;
}
