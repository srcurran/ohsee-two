import path from "path";
import { captureScreenshots } from "./screenshot";
import { generateDiff } from "./diff";
import { generateSemanticDiff } from "./semantic-diff";
import { readJsonFile, writeJsonFile } from "./data";
import { BREAKPOINTS, userProjectsFile, userReportsDir, userDir } from "./constants";
import { mintSessionCookie, type AuthCookieConfig } from "./auth-token";
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

  // Total ops: per page = breakpoints × (prod + dev + diff) × (1 default + N variants)
  const variantCount = (project.variants || []).length;
  const totalOps = project.pages.length * BREAKPOINTS.length * 3 * (1 + variantCount);
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
    // Mint auth cookies if project requires authentication
    let prodAuthConfig: AuthCookieConfig | undefined;
    let devAuthConfig: AuthCookieConfig | undefined;
    if (project.requiresAuth) {
      prodAuthConfig = await mintSessionCookie({ userId, targetUrl: project.prodUrl });
      devAuthConfig = await mintSessionCookie({ userId, targetUrl: project.devUrl });
    }

    const reportPages: ReportPage[] = [];

    for (const page of project.pages) {
      checkCancelled();

      const normProd = project.prodUrl.match(/^https?:\/\//) ? project.prodUrl : `http://${project.prodUrl}`;
      const normDev = project.devUrl.match(/^https?:\/\//) ? project.devUrl : `http://${project.devUrl}`;
      const prodUrl = `${normProd.replace(/\/$/, "")}${page.path}`;
      const devUrl = `${normDev.replace(/\/$/, "")}${page.path}`;

      // --- Default variant (no theme override) ---
      const breakpoints = await captureAndDiff({
        prodUrl,
        devUrl,
        pageId: page.id,
        prefix: "",
        screenshotDir,
        dataBase,
        authConfig: { prod: prodAuthConfig, dev: devAuthConfig },
        checkCancelled,
        onProgress: async () => { completedOps++; await saveProgress(); },
      });

      // --- Additional variants (e.g., light/dark) ---
      let variants: Record<string, Record<string, BreakpointResult>> | undefined;

      if (project.variants && project.variants.length > 0) {
        variants = {};

        for (const variant of project.variants) {
          checkCancelled();

          variants[variant.id] = await captureAndDiff({
            prodUrl,
            devUrl,
            pageId: page.id,
            prefix: `-${variant.id}`,
            screenshotDir,
            dataBase,
            authConfig: { prod: prodAuthConfig, dev: devAuthConfig },
            contextOptions: variant.colorScheme ? { colorScheme: variant.colorScheme } : undefined,
            initScript: variant.initScript,
            checkCancelled,
            onProgress: async () => { completedOps++; await saveProgress(); },
          });
        }
      }

      reportPages.push({
        id: uuidv4(),
        pageId: page.id,
        path: page.path,
        breakpoints,
        ...(variants ? { variants } : {}),
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

/**
 * Capture prod + dev screenshots and generate diffs for all breakpoints.
 * Extracted to avoid duplicating logic between default and variant captures.
 */
async function captureAndDiff(options: {
  prodUrl: string;
  devUrl: string;
  pageId: string;
  /** File prefix suffix for this variant, e.g., "-dark" or "" for default */
  prefix: string;
  screenshotDir: string;
  dataBase: string;
  authConfig: { prod?: AuthCookieConfig; dev?: AuthCookieConfig };
  contextOptions?: { colorScheme?: "light" | "dark" };
  initScript?: string;
  checkCancelled: () => void;
  onProgress: () => Promise<void>;
}): Promise<Record<string, BreakpointResult>> {
  const {
    prodUrl, devUrl, pageId, prefix, screenshotDir, dataBase,
    authConfig, contextOptions, initScript, checkCancelled, onProgress,
  } = options;

  const breakpoints: Record<string, BreakpointResult> = {};

  // Capture prod screenshots
  checkCancelled();
  const prodResults = await captureScreenshots({
    url: prodUrl,
    breakpoints: [...BREAKPOINTS],
    outputDir: screenshotDir,
    prefix: `prod-${pageId}${prefix}`,
    authConfig: authConfig.prod,
    contextOptions,
    initScript,
    onProgress: async () => {
      checkCancelled();
      await onProgress();
    },
  });

  // Capture dev screenshots
  checkCancelled();
  const devResults = await captureScreenshots({
    url: devUrl,
    breakpoints: [...BREAKPOINTS],
    outputDir: screenshotDir,
    prefix: `dev-${pageId}${prefix}`,
    authConfig: authConfig.dev,
    contextOptions,
    initScript,
    onProgress: async () => {
      checkCancelled();
      await onProgress();
    },
  });

  // Generate diffs for each breakpoint
  for (const bp of BREAKPOINTS) {
    checkCancelled();

    const prodShot = prodResults.find((r) => r.breakpoint === bp);
    const devShot = devResults.find((r) => r.breakpoint === bp);

    if (prodShot && devShot) {
      const diffPath = path.join(screenshotDir, `diff-${pageId}${prefix}-${bp}.png`);
      const alignedProdPath = path.join(screenshotDir, `aligned-prod-${pageId}${prefix}-${bp}.png`);
      const alignedDevPath = path.join(screenshotDir, `aligned-dev-${pageId}${prefix}-${bp}.png`);
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
          console.error(`Semantic diff failed for ${prodUrl} at ${bp}px:`, err);
        }
      }

      breakpoints[String(bp)] = bpResult;
    }

    await onProgress();
  }

  return breakpoints;
}
