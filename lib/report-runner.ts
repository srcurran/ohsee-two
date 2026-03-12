import path from "path";
import { captureScreenshots } from "./screenshot";
import { generateDiff } from "./diff";
import { generateSemanticDiff } from "./semantic-diff";
import { readJsonFile, writeJsonFile } from "./data";
import { BREAKPOINTS, userProjectsFile, userReportsDir, userDir } from "./constants";
import type { Project, Report, ReportPage, BreakpointResult } from "./types";
import { v4 as uuidv4 } from "uuid";

/**
 * In-memory map of running report abort controllers.
 * Keyed by reportId.
 */
const runningReports = new Map<string, AbortController>();

/**
 * Returns whether a given report is currently running in this process.
 */
export function isReportRunning(reportId: string): boolean {
  return runningReports.has(reportId);
}

/**
 * Cancel a running report by ID. Returns true if it was running and signalled.
 */
export function cancelReport(reportId: string): boolean {
  const controller = runningReports.get(reportId);
  if (controller) {
    controller.abort();
    return true;
  }
  return false;
}

/**
 * Cancel all running reports for a given project. Returns cancelled report IDs.
 */
export function cancelRunningReportsForProject(projectId: string): string[] {
  const cancelled: string[] = [];
  for (const [reportId, controller] of runningReports.entries()) {
    const meta = reportProjectMap.get(reportId);
    if (meta === projectId) {
      controller.abort();
      cancelled.push(reportId);
    }
  }
  return cancelled;
}

/** Maps reportId → projectId for lookup during cancellation */
const reportProjectMap = new Map<string, string>();

class ReportCancelledError extends Error {
  constructor() {
    super("Report cancelled");
    this.name = "ReportCancelledError";
  }
}

export async function runReport(project: Project, reportId: string, userId: string): Promise<void> {
  const controller = new AbortController();
  runningReports.set(reportId, controller);
  reportProjectMap.set(reportId, project.id);

  const signal = controller.signal;

  const checkCancelled = () => {
    if (signal.aborted) throw new ReportCancelledError();
  };

  const reportsDir = userReportsDir(userId);
  const reportDir = path.join(reportsDir, reportId);
  const screenshotDir = path.join(reportDir, "screenshots");
  const reportPath = path.join(reportDir, "report.json");

  // Base directory for relative paths (user's data dir)
  const dataBase = userDir(userId);

  // Total: per page = 6 prod screenshots + 6 dev screenshots + 6 diffs = 18
  const totalOps = project.pages.length * BREAKPOINTS.length * 3;
  let completedOps = 0;

  const report = await readJsonFile<Report>(reportPath, {
    id: reportId,
    projectId: project.id,
    createdAt: new Date().toISOString(),
    status: "running",
    progress: { completed: 0, total: totalOps },
    pages: [],
  });

  const saveProgress = async () => {
    report.progress = { completed: completedOps, total: totalOps };
    await writeJsonFile(reportPath, report);
  };

  try {
    const reportPages: ReportPage[] = [];

    for (const page of project.pages) {
      checkCancelled();

      const prodUrl = `${project.prodUrl.replace(/\/$/, "")}${page.path}`;
      const devUrl = `${project.devUrl.replace(/\/$/, "")}${page.path}`;

      const breakpoints: Record<string, BreakpointResult> = {};

      // Capture prod screenshots
      checkCancelled();
      const prodResults = await captureScreenshots({
        url: prodUrl,
        breakpoints: [...BREAKPOINTS],
        outputDir: screenshotDir,
        prefix: `prod-${page.id}`,
        onProgress: async () => {
          checkCancelled();
          completedOps++;
          await saveProgress();
        },
      });

      // Capture dev screenshots
      checkCancelled();
      const devResults = await captureScreenshots({
        url: devUrl,
        breakpoints: [...BREAKPOINTS],
        outputDir: screenshotDir,
        prefix: `dev-${page.id}`,
        onProgress: async () => {
          checkCancelled();
          completedOps++;
          await saveProgress();
        },
      });

      // Generate diffs for each breakpoint
      for (const bp of BREAKPOINTS) {
        checkCancelled();

        const prodShot = prodResults.find((r) => r.breakpoint === bp);
        const devShot = devResults.find((r) => r.breakpoint === bp);

        if (prodShot && devShot) {
          const diffPath = path.join(screenshotDir, `diff-${page.id}-${bp}.png`);
          const alignedProdPath = path.join(screenshotDir, `aligned-prod-${page.id}-${bp}.png`);
          const alignedDevPath = path.join(screenshotDir, `aligned-dev-${page.id}-${bp}.png`);
          const diffResult = await generateDiff(
            prodShot.filePath,
            devShot.filePath,
            diffPath,
            alignedProdPath,
            alignedDevPath
          );

          const bpResult: BreakpointResult = {
            prodScreenshot: path.relative(dataBase, prodShot.filePath),
            devScreenshot: path.relative(dataBase, devShot.filePath),
            diffScreenshot: path.relative(dataBase, diffPath),
            alignedProdScreenshot: path.relative(dataBase, alignedProdPath),
            alignedDevScreenshot: path.relative(dataBase, alignedDevPath),
            changeCount: diffResult.changeCount,
            totalPixels: diffResult.totalPixels,
            changePercentage: diffResult.changePercentage,
            pixelChangeCount: diffResult.changeCount,
          };

          // Run semantic diff if DOM snapshots are available
          if (prodShot.domSnapshot && devShot.domSnapshot) {
            try {
              const semanticResult = generateSemanticDiff(
                prodShot.domSnapshot,
                devShot.domSnapshot
              );
              bpResult.semanticChanges = semanticResult.changes;
              bpResult.changeSummary = semanticResult.summary;
              bpResult.changeCount = semanticResult.issueCount;
            } catch (err) {
              console.error(`Semantic diff failed for ${page.path} at ${bp}px:`, err);
            }
          }

          breakpoints[String(bp)] = bpResult;
        }

        completedOps++;
        await saveProgress();
      }

      reportPages.push({
        id: uuidv4(),
        pageId: page.id,
        path: page.path,
        breakpoints,
      });

      report.pages = reportPages;
      await writeJsonFile(reportPath, report);
    }

    report.pages = reportPages;
    report.status = "completed";
    report.progress = { completed: totalOps, total: totalOps };
    await writeJsonFile(reportPath, report);

    // Update project lastDiffAt
    const projectsFile = userProjectsFile(userId);
    const projects = await readJsonFile<Project[]>(projectsFile, []);
    const projectIdx = projects.findIndex((p) => p.id === project.id);
    if (projectIdx !== -1) {
      projects[projectIdx].lastDiffAt = report.createdAt;
      await writeJsonFile(projectsFile, projects);
    }
  } catch (err) {
    if (err instanceof ReportCancelledError) {
      report.status = "cancelled";
      await writeJsonFile(reportPath, report);
    } else {
      const message = err instanceof Error ? err.stack || err.message : String(err);
      console.error("Report run failed:", message);
      report.status = "failed";
      report.error = message;
      await writeJsonFile(reportPath, report);
    }
  } finally {
    runningReports.delete(reportId);
    reportProjectMap.delete(reportId);
  }
}
