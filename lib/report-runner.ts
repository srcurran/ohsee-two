import path from "path";
import { captureScreenshots } from "./screenshot";
import { generateDiff } from "./diff";
import { readJsonFile, writeJsonFile } from "./data";
import { BREAKPOINTS, PROJECTS_FILE, REPORTS_DIR } from "./constants";
import type { Project, Report, ReportPage, BreakpointResult } from "./types";
import { v4 as uuidv4 } from "uuid";

export async function runReport(project: Project, reportId: string): Promise<void> {
  const reportDir = path.join(REPORTS_DIR, reportId);
  const screenshotDir = path.join(reportDir, "screenshots");
  const reportPath = path.join(reportDir, "report.json");

  const report = await readJsonFile<Report>(reportPath, {
    id: reportId,
    projectId: project.id,
    createdAt: new Date().toISOString(),
    status: "running",
    pages: [],
  });

  try {
    const reportPages: ReportPage[] = [];

    for (const page of project.pages) {
      const prodUrl = `${project.prodUrl.replace(/\/$/, "")}${page.path}`;
      const devUrl = `${project.devUrl.replace(/\/$/, "")}${page.path}`;

      const breakpoints: Record<string, BreakpointResult> = {};

      // Capture prod screenshots
      const prodResults = await captureScreenshots({
        url: prodUrl,
        breakpoints: [...BREAKPOINTS],
        outputDir: screenshotDir,
        prefix: `prod-${page.id}`,
      });

      // Capture dev screenshots
      const devResults = await captureScreenshots({
        url: devUrl,
        breakpoints: [...BREAKPOINTS],
        outputDir: screenshotDir,
        prefix: `dev-${page.id}`,
      });

      // Generate diffs for each breakpoint
      for (const bp of BREAKPOINTS) {
        const prodShot = prodResults.find((r) => r.breakpoint === bp);
        const devShot = devResults.find((r) => r.breakpoint === bp);

        if (prodShot && devShot) {
          const diffPath = path.join(screenshotDir, `diff-${page.id}-${bp}.png`);
          const diffResult = await generateDiff(prodShot.filePath, devShot.filePath, diffPath);

          // Store relative paths from the data directory
          breakpoints[String(bp)] = {
            prodScreenshot: path.relative(path.join(process.cwd(), "data"), prodShot.filePath),
            devScreenshot: path.relative(path.join(process.cwd(), "data"), devShot.filePath),
            diffScreenshot: path.relative(path.join(process.cwd(), "data"), diffPath),
            changeCount: diffResult.changeCount,
            totalPixels: diffResult.totalPixels,
            changePercentage: diffResult.changePercentage,
          };
        }
      }

      reportPages.push({
        id: uuidv4(),
        pageId: page.id,
        path: page.path,
        breakpoints,
      });

      // Update report in-progress
      report.pages = reportPages;
      await writeJsonFile(reportPath, report);
    }

    report.pages = reportPages;
    report.status = "completed";
    await writeJsonFile(reportPath, report);

    // Update project lastDiffAt
    const projects = await readJsonFile<Project[]>(PROJECTS_FILE, []);
    const projectIdx = projects.findIndex((p) => p.id === project.id);
    if (projectIdx !== -1) {
      projects[projectIdx].lastDiffAt = report.createdAt;
      await writeJsonFile(PROJECTS_FILE, projects);
    }
  } catch (err) {
    console.error("Report run failed:", err);
    report.status = "failed";
    await writeJsonFile(reportPath, report);
  }
}
