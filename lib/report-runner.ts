import path from "path";
import { captureScreenshots } from "./screenshot";
import { generateDiff } from "./diff";
import { generateSemanticDiff } from "./semantic-diff";
import { readJsonFile, writeJsonFile } from "./data";
import { BREAKPOINTS, userProjectsFile, userReportsDir, userDir } from "./constants";
import { mintSessionCookie, type AuthCookieConfig } from "./auth-token";
import type { Project, SiteTest, Report, ReportPage, BreakpointResult, FlowEntry, TestComposition } from "./types";
import { executeFlow, getScreenshotStepIds, type FlowScreenshotResult } from "./flow-runner";
import { executeTestComposition, getCompositionScreenshotSteps, type MicroTestStepResult } from "./micro-test-runner";
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

/**
 * Run a visual regression report.
 * If `siteTest` is provided, pages/flows come from it. Otherwise falls back to project-level pages/flows (legacy).
 */
export async function runReport(project: Project, reportId: string, userId: string, siteTest?: SiteTest): Promise<void> {
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

  // Use test-level breakpoints if set, then fall back to project-level (legacy), then global defaults
  const projectBreakpoints = siteTest?.breakpoints?.length
    ? siteTest.breakpoints
    : project.breakpoints?.length ? project.breakpoints : [...BREAKPOINTS];

  // Resolve pages and flows from siteTest (preferred) or project (legacy)
  const testPages = siteTest?.pages ?? project.pages;
  const testFlows = siteTest?.flows ?? project.flows ?? [];

  // Use test-level variants if set, then fall back to project-level (legacy)
  const testVariants = siteTest?.variants ?? project.variants ?? [];
  // Total ops: per page = breakpoints × (prod + dev + diff) × (1 default + N variants)
  const variantCount = testVariants.length;
  // Resolve compositions from siteTest
  const testCompositions: TestComposition[] = siteTest?.compositions ?? [];

  // Count screenshot steps across all flows
  const flowScreenshotSteps = testFlows.reduce((sum, flow) =>
    sum + getScreenshotStepIds(flow).length, 0);
  // Count screenshot steps across all compositions
  const compositionScreenshotSteps = testCompositions.reduce((sum, comp) =>
    sum + getCompositionScreenshotSteps(project, comp).length, 0);
  const pageOps = testPages.length * projectBreakpoints.length * 3 * (1 + variantCount);
  // Flow ops: per screenshot step = breakpoints × (prod + dev + diff) × (1 + variants)
  const flowOps = flowScreenshotSteps * projectBreakpoints.length * 3 * (1 + variantCount);
  const compositionOps = compositionScreenshotSteps * projectBreakpoints.length * 3 * (1 + variantCount);
  const totalOps = pageOps + flowOps + compositionOps;
  let completedOps = 0;

  const report = await readJsonFile<Report>(reportPath, {
    id: reportId,
    projectId: project.id,
    ...(siteTest ? { siteTestId: siteTest.id } : {}),
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

    for (const page of testPages) {
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
        breakpointList: projectBreakpoints,
        checkCancelled,
        onProgress: async () => { completedOps++; await saveProgress(); },
      });

      // --- Additional variants (e.g., light/dark) ---
      let variants: Record<string, Record<string, BreakpointResult>> | undefined;

      if (testVariants && testVariants.length > 0) {
        variants = {};

        for (const variant of testVariants) {
          checkCancelled();

          variants[variant.id] = await captureAndDiff({
            prodUrl,
            devUrl,
            pageId: page.id,
            prefix: `-${variant.id}`,
            screenshotDir,
            dataBase,
            authConfig: { prod: prodAuthConfig, dev: devAuthConfig },
            breakpointList: projectBreakpoints,
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

    // --- Flow execution ---
    if (testFlows.length > 0) {
      for (const flow of testFlows) {
        checkCancelled();

        const normProd = project.prodUrl.match(/^https?:\/\//) ? project.prodUrl : `http://${project.prodUrl}`;
        const normDev = project.devUrl.match(/^https?:\/\//) ? project.devUrl : `http://${project.devUrl}`;

        // --- Default variant ---
        const flowBreakpoints = await captureAndDiffFlow({
          flow,
          prodBaseUrl: normProd,
          devBaseUrl: normDev,
          prefix: "",
          screenshotDir,
          dataBase,
          authConfig: { prod: prodAuthConfig, dev: devAuthConfig },
          breakpointList: projectBreakpoints,
          checkCancelled,
          onProgress: async () => { completedOps++; await saveProgress(); },
        });

        // --- Variant captures for flows ---
        let flowVariants: Record<string, typeof flowBreakpoints> | undefined;
        if (testVariants && testVariants.length > 0) {
          flowVariants = {};
          for (const variant of testVariants) {
            checkCancelled();
            flowVariants[variant.id] = await captureAndDiffFlow({
              flow,
              prodBaseUrl: normProd,
              devBaseUrl: normDev,
              prefix: `-${variant.id}`,
              screenshotDir,
              dataBase,
              authConfig: { prod: prodAuthConfig, dev: devAuthConfig },
              breakpointList: projectBreakpoints,
              contextOptions: variant.colorScheme ? { colorScheme: variant.colorScheme } : undefined,
              initScript: variant.initScript,
              checkCancelled,
              onProgress: async () => { completedOps++; await saveProgress(); },
            });
          }
        }

        // Convert flow results into ReportPages (one per step that captures a screenshot)
        const screenshotSteps = getScreenshotStepIds(flow);
        for (const step of screenshotSteps) {
          const stepBreakpoints: Record<string, BreakpointResult> = {};
          for (const bp of projectBreakpoints) {
            const key = `${step.id}-${bp}`;
            if (flowBreakpoints[key]) {
              stepBreakpoints[String(bp)] = flowBreakpoints[key];
            }
          }

          let stepVariants: Record<string, Record<string, BreakpointResult>> | undefined;
          if (flowVariants) {
            stepVariants = {};
            for (const [variantId, variantResults] of Object.entries(flowVariants)) {
              stepVariants[variantId] = {};
              for (const bp of projectBreakpoints) {
                const key = `${step.id}-${bp}`;
                if (variantResults[key]) {
                  stepVariants[variantId][String(bp)] = variantResults[key];
                }
              }
            }
          }

          reportPages.push({
            id: uuidv4(),
            pageId: step.id,
            path: `${flow.name} > ${step.label}`,
            breakpoints: stepBreakpoints,
            ...(stepVariants ? { variants: stepVariants } : {}),
            flowId: flow.id,
            stepLabel: step.label,
          });
        }

        report.pages = reportPages;
        await writeJsonFile(reportPath, report);
      }
    }

    // --- Composition execution (micro-test based) ---
    if (testCompositions.length > 0) {
      for (const composition of testCompositions) {
        checkCancelled();

        const normProd = project.prodUrl.match(/^https?:\/\//) ? project.prodUrl : `http://${project.prodUrl}`;
        const normDev = project.devUrl.match(/^https?:\/\//) ? project.devUrl : `http://${project.devUrl}`;

        // --- Default variant ---
        const compBreakpoints = await captureAndDiffComposition({
          project,
          composition,
          prodBaseUrl: normProd,
          devBaseUrl: normDev,
          prefix: "",
          screenshotDir,
          dataBase,
          authConfig: { prod: prodAuthConfig, dev: devAuthConfig },
          breakpointList: projectBreakpoints,
          checkCancelled,
          onProgress: async () => { completedOps++; await saveProgress(); },
        });

        // --- Variant captures for compositions ---
        let compVariants: Record<string, typeof compBreakpoints> | undefined;
        if (testVariants && testVariants.length > 0) {
          compVariants = {};
          for (const variant of testVariants) {
            checkCancelled();
            compVariants[variant.id] = await captureAndDiffComposition({
              project,
              composition,
              prodBaseUrl: normProd,
              devBaseUrl: normDev,
              prefix: `-${variant.id}`,
              screenshotDir,
              dataBase,
              authConfig: { prod: prodAuthConfig, dev: devAuthConfig },
              breakpointList: projectBreakpoints,
              contextOptions: variant.colorScheme ? { colorScheme: variant.colorScheme } : undefined,
              initScript: variant.initScript,
              checkCancelled,
              onProgress: async () => { completedOps++; await saveProgress(); },
            });
          }
        }

        // Convert composition results into ReportPages
        const screenshotSteps = getCompositionScreenshotSteps(project, composition);
        for (const step of screenshotSteps) {
          const stepBreakpoints: Record<string, BreakpointResult> = {};
          for (const bp of projectBreakpoints) {
            const key = `${step.id}-${bp}`;
            if (compBreakpoints[key]) {
              stepBreakpoints[String(bp)] = compBreakpoints[key];
            }
          }

          let stepVariants: Record<string, Record<string, BreakpointResult>> | undefined;
          if (compVariants) {
            stepVariants = {};
            for (const [variantId, variantResults] of Object.entries(compVariants)) {
              stepVariants[variantId] = {};
              for (const bp of projectBreakpoints) {
                const key = `${step.id}-${bp}`;
                if (variantResults[key]) {
                  stepVariants[variantId][String(bp)] = variantResults[key];
                }
              }
            }
          }

          reportPages.push({
            id: uuidv4(),
            pageId: step.id,
            path: `${composition.name} > ${step.label}`,
            breakpoints: stepBreakpoints,
            ...(stepVariants ? { variants: stepVariants } : {}),
            flowId: composition.id,
            stepLabel: step.label,
          });
        }

        report.pages = reportPages;
        await writeJsonFile(reportPath, report);
      }
    }

    report.pages = reportPages;
    report.status = "completed";
    report.progress = { completed: totalOps, total: totalOps };
    await writeJsonFile(reportPath, report);

    // Update project lastDiffAt and siteTest lastRunAt
    const projectsFile = userProjectsFile(userId);
    const projects = await readJsonFile<Project[]>(projectsFile, []);
    const projectIdx = projects.findIndex((p) => p.id === project.id);
    if (projectIdx !== -1) {
      projects[projectIdx].lastDiffAt = report.createdAt;
      if (siteTest && projects[projectIdx].tests) {
        const testIdx = projects[projectIdx].tests!.findIndex((t) => t.id === siteTest.id);
        if (testIdx !== -1) {
          projects[projectIdx].tests![testIdx].lastRunAt = report.createdAt;
        }
      }
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
  /** Breakpoints to capture (defaults to global BREAKPOINTS) */
  breakpointList?: number[];
  contextOptions?: { colorScheme?: "light" | "dark" };
  initScript?: string;
  checkCancelled: () => void;
  onProgress: () => Promise<void>;
}): Promise<Record<string, BreakpointResult>> {
  const {
    prodUrl, devUrl, pageId, prefix, screenshotDir, dataBase,
    authConfig, breakpointList = [...BREAKPOINTS], contextOptions, initScript,
    checkCancelled, onProgress,
  } = options;

  const breakpoints: Record<string, BreakpointResult> = {};

  // Capture prod screenshots
  checkCancelled();
  const prodResults = await captureScreenshots({
    url: prodUrl,
    breakpoints: breakpointList,
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
    breakpoints: breakpointList,
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
  for (const bp of breakpointList) {
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

/**
 * Execute a flow against prod + dev and generate diffs for each screenshot step.
 * Returns results keyed by "{stepId}-{breakpoint}".
 */
async function captureAndDiffFlow(options: {
  flow: FlowEntry;
  prodBaseUrl: string;
  devBaseUrl: string;
  prefix: string;
  screenshotDir: string;
  dataBase: string;
  authConfig: { prod?: AuthCookieConfig; dev?: AuthCookieConfig };
  breakpointList?: number[];
  contextOptions?: { colorScheme?: "light" | "dark" };
  initScript?: string;
  checkCancelled: () => void;
  onProgress: () => Promise<void>;
}): Promise<Record<string, BreakpointResult>> {
  const {
    flow, prodBaseUrl, devBaseUrl, prefix, screenshotDir, dataBase,
    authConfig, breakpointList = [...BREAKPOINTS], contextOptions, initScript,
    checkCancelled, onProgress,
  } = options;

  const results: Record<string, BreakpointResult> = {};

  // Capture prod flow
  checkCancelled();
  const prodResults = await executeFlow({
    flow,
    baseUrl: prodBaseUrl,
    breakpoints: breakpointList,
    outputDir: screenshotDir,
    prefix: `prod-flow-${flow.id}${prefix}`,
    authConfig: authConfig.prod,
    contextOptions,
    initScript,
    onProgress: async () => {
      checkCancelled();
      await onProgress();
    },
  });

  // Capture dev flow
  checkCancelled();
  const devResults = await executeFlow({
    flow,
    baseUrl: devBaseUrl,
    breakpoints: breakpointList,
    outputDir: screenshotDir,
    prefix: `dev-flow-${flow.id}${prefix}`,
    authConfig: authConfig.dev,
    contextOptions,
    initScript,
    onProgress: async () => {
      checkCancelled();
      await onProgress();
    },
  });

  // Generate diffs for each step that captures a screenshot
  const screenshotSteps = getScreenshotStepIds(flow);
  for (const step of screenshotSteps) {
    for (const bp of breakpointList) {
      checkCancelled();

      const prodShot = prodResults.find((r) => r.stepId === step.id && r.breakpoint === bp);
      const devShot = devResults.find((r) => r.stepId === step.id && r.breakpoint === bp);

      if (prodShot && devShot) {
        const diffPath = path.join(screenshotDir, `diff-flow-${flow.id}-${step.id}${prefix}-${bp}.png`);
        const alignedProdPath = path.join(screenshotDir, `aligned-prod-flow-${flow.id}-${step.id}${prefix}-${bp}.png`);
        const alignedDevPath = path.join(screenshotDir, `aligned-dev-flow-${flow.id}-${step.id}${prefix}-${bp}.png`);

        const diffResult = await generateDiff(
          prodShot.filePath,
          devShot.filePath,
          diffPath,
          alignedProdPath,
          alignedDevPath,
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

        if (prodShot.domSnapshot && devShot.domSnapshot) {
          try {
            const semanticResult = generateSemanticDiff(
              prodShot.domSnapshot,
              devShot.domSnapshot,
            );
            bpResult.semanticChanges = semanticResult.changes;
            bpResult.changeSummary = semanticResult.summary;
            bpResult.changeCount = semanticResult.issueCount;
          } catch (err) {
            console.error(`Semantic diff failed for flow "${flow.name}" step "${step.id}" at ${bp}px:`, err);
          }
        }

        results[`${step.id}-${bp}`] = bpResult;
      }

      await onProgress();
    }
  }

  return results;
}

/**
 * Capture prod + dev screenshots for a TestComposition, then generate diffs.
 * Mirrors captureAndDiffFlow but uses the micro-test runner.
 */
async function captureAndDiffComposition(options: {
  project: Project;
  composition: TestComposition;
  prodBaseUrl: string;
  devBaseUrl: string;
  prefix: string;
  screenshotDir: string;
  dataBase: string;
  authConfig: { prod?: AuthCookieConfig; dev?: AuthCookieConfig };
  breakpointList?: number[];
  contextOptions?: { colorScheme?: "light" | "dark" };
  initScript?: string;
  checkCancelled: () => void;
  onProgress: () => Promise<void>;
}): Promise<Record<string, BreakpointResult>> {
  const {
    project, composition, prodBaseUrl, devBaseUrl, prefix, screenshotDir, dataBase,
    authConfig, breakpointList = [...BREAKPOINTS], contextOptions, initScript,
    checkCancelled, onProgress,
  } = options;

  const results: Record<string, BreakpointResult> = {};

  // Capture prod composition
  checkCancelled();
  const prodResults = await executeTestComposition({
    project,
    composition,
    baseUrl: prodBaseUrl,
    breakpoints: breakpointList,
    outputDir: screenshotDir,
    prefix: `prod-comp-${composition.id}${prefix}`,
    authConfig: authConfig.prod,
    contextOptions,
    initScript,
    onProgress: async () => {
      checkCancelled();
      await onProgress();
    },
  });

  // Capture dev composition
  checkCancelled();
  const devResults = await executeTestComposition({
    project,
    composition,
    baseUrl: devBaseUrl,
    breakpoints: breakpointList,
    outputDir: screenshotDir,
    prefix: `dev-comp-${composition.id}${prefix}`,
    authConfig: authConfig.dev,
    contextOptions,
    initScript,
    onProgress: async () => {
      checkCancelled();
      await onProgress();
    },
  });

  // Generate diffs for each step that captures a screenshot
  const screenshotSteps = getCompositionScreenshotSteps(project, composition);
  for (const step of screenshotSteps) {
    for (const bp of breakpointList) {
      checkCancelled();

      const prodShot = prodResults.find((r) => r.stepId === step.id && r.breakpoint === bp);
      const devShot = devResults.find((r) => r.stepId === step.id && r.breakpoint === bp);

      if (prodShot && devShot) {
        const diffPath = path.join(screenshotDir, `diff-comp-${composition.id}-${step.id}${prefix}-${bp}.png`);
        const alignedProdPath = path.join(screenshotDir, `aligned-prod-comp-${composition.id}-${step.id}${prefix}-${bp}.png`);
        const alignedDevPath = path.join(screenshotDir, `aligned-dev-comp-${composition.id}-${step.id}${prefix}-${bp}.png`);

        const diffResult = await generateDiff(
          prodShot.filePath,
          devShot.filePath,
          diffPath,
          alignedProdPath,
          alignedDevPath,
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

        if (prodShot.domSnapshot && devShot.domSnapshot) {
          try {
            const semanticResult = generateSemanticDiff(
              prodShot.domSnapshot,
              devShot.domSnapshot,
            );
            bpResult.semanticChanges = semanticResult.changes;
            bpResult.changeSummary = semanticResult.summary;
            bpResult.changeCount = semanticResult.issueCount;
          } catch (err) {
            console.error(`Semantic diff failed for composition "${composition.name}" step "${step.id}" at ${bp}px:`, err);
          }
        }

        results[`${step.id}-${bp}`] = bpResult;
      }

      await onProgress();
    }
  }

  return results;
}
