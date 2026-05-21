import path from "path";
import { chromium, type Browser } from "playwright";
import { captureScreenshots } from "./screenshot";
import { generateDiff } from "./diff";
import { generateSemanticDiff } from "./semantic-diff";
import { readJsonFile, writeJsonFile } from "./data";
import { BREAKPOINTS, userProjectsFile, userReportsDir, userDir } from "./constants";
import { mintSessionCookie, type AuthCookieConfig } from "./auth-token";
import type { Project, SiteTest, Report, ReportPage, BreakpointResult, FlowEntry, TestComposition, ScriptCredentials } from "./types";
import { executeFlow, getScreenshotStepIds } from "./flow-runner";
import { executeTestComposition, getCompositionScreenshotSteps } from "./micro-test-runner";
import { splitStepsForRunner } from "./test-steps";
import { v4 as uuidv4 } from "uuid";

const BROWSER_ARGS = ["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu"];

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

export type RunReportOptions = {
  /** Fired after the run reaches a terminal state (completed, cancelled, or failed). */
  onComplete?: (report: Report) => void;
  /** Vault credentials resolved by the client for $EMAIL$ / $PASSWORD$ / $OTP$
   *  interpolation inside Playwright script steps. */
  scriptCredentials?: ScriptCredentials;
};

/**
 * Run a visual regression report.
 * If `siteTest` is provided, pages/flows come from it. Otherwise falls back to project-level pages/flows (legacy).
 */
export async function runReport(
  project: Project,
  reportId: string,
  userId: string,
  siteTest?: SiteTest,
  options?: RunReportOptions,
): Promise<void> {
  const controller = new AbortController();
  runningReports.set(reportId, controller);
  reportProjectMap.set(reportId, project.id);

  const scriptCredentials = options?.scriptCredentials;
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

  // When the new unified steps[] is present, decompose it into legacy
  // pages + a synthetic composition the existing executors already
  // understand. Falls through to project/legacy fields otherwise.
  const unified = siteTest?.steps && siteTest.steps.length > 0
    ? splitStepsForRunner(siteTest.steps)
    : null;

  const testPages = unified
    ? unified.pages
    : siteTest?.pages ?? project.pages;
  const testFlows = unified
    ? []  // unified steps supersede legacy flows
    : siteTest?.flows ?? project.flows ?? [];

  // Map step IDs → their position in the user's step list so we can
  // restore the interleaved order after all loops finish. URL pages and
  // composition steps run in separate loops, which scrambles the ordering.
  const stepOrder = new Map<string, number>();
  if (siteTest?.steps) {
    for (let i = 0; i < siteTest.steps.length; i++) {
      stepOrder.set(siteTest.steps[i].id, i);
    }
  }

  // Use test-level variants if set, then fall back to project-level (legacy)
  const testVariants = siteTest?.variants ?? project.variants ?? [];
  // Total ops: per page = breakpoints × (prod + dev + diff) × (1 default + N variants)
  const variantCount = testVariants.length;
  // Resolve compositions from the unified steps split (preferred) or
  // siteTest.compositions (legacy).
  const testCompositions: TestComposition[] = unified
    ? unified.composition ? [unified.composition] : []
    : siteTest?.compositions ?? [];

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

  // Serialize progress saves so parallel breakpoint callbacks don't
  // cause concurrent writes to the same report file.
  let saveChain = Promise.resolve();
  const saveProgress = async () => {
    report.progress = { completed: completedOps, total: totalOps };
    const p = saveChain.then(() => writeJsonFile(reportPath, report));
    saveChain = p.catch(() => {});
    await p;
  };

  let prodBrowser: Browser | undefined;
  let devBrowser: Browser | undefined;

  try {
    // Launch two long-lived browsers — one for prod, one for dev — so
    // capture functions reuse them instead of launching/closing per call.
    [prodBrowser, devBrowser] = await Promise.all([
      chromium.launch({ headless: true, args: BROWSER_ARGS }),
      chromium.launch({ headless: true, args: BROWSER_ARGS }),
    ]);
    // Mint auth cookies. Per-test credentials (siteTest.credentials.enabled
    // — possibly via copyFromTestId) take precedence over the legacy
    // project.requiresAuth flag so different tests can run as different
    // identities. The actual identity comes from `userId` in either case;
    // future work will plumb a vault entry id through to support distinct
    // accounts per test.
    const credentialsEnabled = resolveCredentialsEnabled(project, siteTest);
    let prodAuthConfig: AuthCookieConfig | undefined;
    let devAuthConfig: AuthCookieConfig | undefined;
    if (credentialsEnabled) {
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
        prodBrowser,
        devBrowser,
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
            prodBrowser,
            devBrowser,
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
          prodBrowser,
          devBrowser,
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
              prodBrowser,
              devBrowser,
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

        // Map stepId → index in reportPages so variant results can
        // update the page that was already flushed during the default pass.
        const screenshotSteps = getCompositionScreenshotSteps(project, composition);
        const stepPageIndex = new Map<string, number>();

        // --- Default variant (flushes pages per-step via callback) ---
        await captureAndDiffComposition({
          project,
          composition,
          prodBaseUrl: normProd,
          devBaseUrl: normDev,
          prefix: "",
          screenshotDir,
          dataBase,
          authConfig: { prod: prodAuthConfig, dev: devAuthConfig },
          breakpointList: projectBreakpoints,
          credentials: scriptCredentials,
          checkCancelled,
          onProgress: async () => { completedOps++; await saveProgress(); },
          onStepDiffed: async (stepId, stepResults) => {
            const stepMeta = screenshotSteps.find((s) => s.id === stepId);
            const page: ReportPage = {
              id: uuidv4(),
              pageId: stepId,
              path: `${composition.name} > ${stepMeta?.label ?? stepId}`,
              breakpoints: stepResults,
              flowId: composition.id,
              stepLabel: stepMeta?.label ?? stepId,
            };
            stepPageIndex.set(stepId, reportPages.length);
            reportPages.push(page);
            report.pages = reportPages;
            await writeJsonFile(reportPath, report);
          },
          prodBrowser,
          devBrowser,
        });

        // --- Variant captures for compositions ---
        if (testVariants && testVariants.length > 0) {
          for (const variant of testVariants) {
            checkCancelled();
            await captureAndDiffComposition({
              project,
              composition,
              prodBaseUrl: normProd,
              devBaseUrl: normDev,
              prefix: `-${variant.id}`,
              screenshotDir,
              dataBase,
              authConfig: { prod: prodAuthConfig, dev: devAuthConfig },
              breakpointList: projectBreakpoints,
              credentials: scriptCredentials,
              contextOptions: variant.colorScheme ? { colorScheme: variant.colorScheme } : undefined,
              initScript: variant.initScript,
              checkCancelled,
              onProgress: async () => { completedOps++; await saveProgress(); },
              onStepDiffed: async (stepId, stepResults) => {
                const idx = stepPageIndex.get(stepId);
                if (idx !== undefined) {
                  const page = reportPages[idx];
                  if (!page.variants) page.variants = {};
                  page.variants[variant.id] = stepResults;
                  report.pages = reportPages;
                  await writeJsonFile(reportPath, report);
                }
              },
              prodBrowser,
              devBrowser,
            });
          }
        }
      }
    }

    // Restore the user's step ordering — URL pages and compositions run
    // in separate loops so their results may be interleaved incorrectly.
    if (stepOrder.size > 0) {
      reportPages.sort((a, b) => {
        const ai = stepOrder.get(a.pageId) ?? Infinity;
        const bi = stepOrder.get(b.pageId) ?? Infinity;
        return ai - bi;
      });
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
    await prodBrowser?.close().catch(() => {});
    await devBrowser?.close().catch(() => {});
    runningReports.delete(reportId);
    reportProjectMap.delete(reportId);
    if (options?.onComplete) {
      try {
        options.onComplete(report);
      } catch (err) {
        console.error("runReport onComplete callback threw:", err);
      }
    }
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
  prodBrowser?: Browser;
  devBrowser?: Browser;
}): Promise<Record<string, BreakpointResult>> {
  const {
    prodUrl, devUrl, pageId, prefix, screenshotDir, dataBase,
    authConfig, breakpointList = [...BREAKPOINTS], contextOptions, initScript,
    checkCancelled, onProgress, prodBrowser, devBrowser,
  } = options;

  const breakpoints: Record<string, BreakpointResult> = {};

  // Capture prod and dev screenshots in parallel
  checkCancelled();
  const [prodResults, devResults] = await Promise.all([
    captureScreenshots({
      url: prodUrl,
      breakpoints: breakpointList,
      outputDir: screenshotDir,
      prefix: `prod-${pageId}${prefix}`,
      authConfig: authConfig.prod,
      contextOptions,
      initScript,
      browser: prodBrowser,
      onProgress: async () => {
        checkCancelled();
        await onProgress();
      },
    }),
    captureScreenshots({
      url: devUrl,
      breakpoints: breakpointList,
      outputDir: screenshotDir,
      prefix: `dev-${pageId}${prefix}`,
      authConfig: authConfig.dev,
      contextOptions,
      initScript,
      browser: devBrowser,
      onProgress: async () => {
        checkCancelled();
        await onProgress();
      },
    }),
  ]);

  // Generate diffs for each breakpoint in parallel
  await Promise.all(breakpointList.map(async (bp) => {
    checkCancelled();

    const prodShot = prodResults.find((r) => r.breakpoint === bp);
    const devShot = devResults.find((r) => r.breakpoint === bp);

    if (prodShot && devShot) {
      const diffPath = path.join(screenshotDir, `diff-${pageId}${prefix}-${bp}.png`);
      const alignedProdPath = path.join(screenshotDir, `aligned-prod-${pageId}${prefix}-${bp}.png`);
      const alignedDevPath = path.join(screenshotDir, `aligned-dev-${pageId}${prefix}-${bp}.png`);
      const highlightPath = path.join(screenshotDir, `highlight-${pageId}${prefix}-${bp}.png`);
      const diffResult = await generateDiff(
        prodShot.filePath,
        devShot.filePath,
        diffPath,
        alignedProdPath,
        alignedDevPath,
        undefined,
        highlightPath,
      );

      const bpResult: BreakpointResult = {
        prodScreenshot: path.relative(dataBase, prodShot.filePath),
        devScreenshot: path.relative(dataBase, devShot.filePath),
        diffScreenshot: path.relative(dataBase, diffPath),
        alignedProdScreenshot: path.relative(dataBase, alignedProdPath),
        alignedDevScreenshot: path.relative(dataBase, alignedDevPath),
        highlightScreenshot: diffResult.highlightImagePath
          ? path.relative(dataBase, diffResult.highlightImagePath) : undefined,
        prodUrl: prodShot.url,
        devUrl: devShot.url,
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
          bpResult.changeCount = Math.max(bpResult.pixelChangeCount ?? 0, semanticResult.issueCount);
        } catch (err) {
          console.error(`Semantic diff failed for ${prodUrl} at ${bp}px:`, err);
        }
      }

      breakpoints[String(bp)] = bpResult;
    }

    await onProgress();
  }));

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
  prodBrowser?: Browser;
  devBrowser?: Browser;
}): Promise<Record<string, BreakpointResult>> {
  const {
    flow, prodBaseUrl, devBaseUrl, prefix, screenshotDir, dataBase,
    authConfig, breakpointList = [...BREAKPOINTS], contextOptions, initScript,
    checkCancelled, onProgress, prodBrowser, devBrowser,
  } = options;

  const results: Record<string, BreakpointResult> = {};

  // Capture prod and dev flows in parallel
  checkCancelled();
  const [prodResults, devResults] = await Promise.all([
    executeFlow({
      flow,
      baseUrl: prodBaseUrl,
      breakpoints: breakpointList,
      outputDir: screenshotDir,
      prefix: `prod-flow-${flow.id}${prefix}`,
      authConfig: authConfig.prod,
      contextOptions,
      initScript,
      browser: prodBrowser,
      onProgress: async () => {
        checkCancelled();
        await onProgress();
      },
    }),
    executeFlow({
      flow,
      baseUrl: devBaseUrl,
      breakpoints: breakpointList,
      outputDir: screenshotDir,
      prefix: `dev-flow-${flow.id}${prefix}`,
      authConfig: authConfig.dev,
      contextOptions,
      initScript,
      browser: devBrowser,
      onProgress: async () => {
        checkCancelled();
        await onProgress();
      },
    }),
  ]);

  // Generate diffs for all steps × breakpoints in parallel
  const screenshotSteps = getScreenshotStepIds(flow);
  await Promise.all(screenshotSteps.flatMap((step) =>
    breakpointList.map(async (bp) => {
      checkCancelled();

      const prodShot = prodResults.find((r) => r.stepId === step.id && r.breakpoint === bp);
      const devShot = devResults.find((r) => r.stepId === step.id && r.breakpoint === bp);

      if (prodShot && devShot) {
        const diffPath = path.join(screenshotDir, `diff-flow-${flow.id}-${step.id}${prefix}-${bp}.png`);
        const alignedProdPath = path.join(screenshotDir, `aligned-prod-flow-${flow.id}-${step.id}${prefix}-${bp}.png`);
        const alignedDevPath = path.join(screenshotDir, `aligned-dev-flow-${flow.id}-${step.id}${prefix}-${bp}.png`);
        const highlightPath = path.join(screenshotDir, `highlight-flow-${flow.id}-${step.id}${prefix}-${bp}.png`);

        const diffResult = await generateDiff(
          prodShot.filePath,
          devShot.filePath,
          diffPath,
          alignedProdPath,
          alignedDevPath,
          undefined,
          highlightPath,
        );

        const bpResult: BreakpointResult = {
          prodScreenshot: path.relative(dataBase, prodShot.filePath),
          devScreenshot: path.relative(dataBase, devShot.filePath),
          diffScreenshot: path.relative(dataBase, diffPath),
          alignedProdScreenshot: path.relative(dataBase, alignedProdPath),
          alignedDevScreenshot: path.relative(dataBase, alignedDevPath),
          highlightScreenshot: diffResult.highlightImagePath
            ? path.relative(dataBase, diffResult.highlightImagePath) : undefined,
          prodUrl: prodShot.url,
          devUrl: devShot.url,
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
            bpResult.changeCount = Math.max(bpResult.pixelChangeCount ?? 0, semanticResult.issueCount);
          } catch (err) {
            console.error(`Semantic diff failed for flow "${flow.name}" step "${step.id}" at ${bp}px:`, err);
          }
        }

        results[`${step.id}-${bp}`] = bpResult;
      }

      await onProgress();
    })
  ));

  return results;
}

/**
 * Resolve whether a run should mint + inject auth cookies. Per-test
 * credentials (with optional copy-from indirection) override the legacy
 * project-level `requiresAuth` flag so different tests can target
 * different identities — though distinct account values still need a
 * vault entry id once that path is wired up.
 */
function resolveCredentialsEnabled(project: Project, siteTest?: SiteTest): boolean {
  const creds = siteTest?.credentials;
  if (creds) {
    if (creds.copyFromTestId) {
      const referenced = project.tests?.find((t) => t.id === creds.copyFromTestId);
      if (referenced?.credentials?.enabled) return true;
    }
    if (creds.enabled) return true;
  }
  return Boolean(project.requiresAuth);
}

/**
 * Capture prod + dev screenshots for a TestComposition, then generate diffs.
 * Mirrors captureAndDiffFlow but uses the micro-test runner.
 *
 * Streaming: uses `onStepCaptured` callbacks from both the prod and dev
 * composition runs to diff each step as soon as all breakpoints for that
 * step are available on BOTH sides — rather than waiting for the entire
 * composition to finish. This gets the first page into the report much
 * faster while later steps are still capturing.
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
  credentials?: ScriptCredentials;
  contextOptions?: { colorScheme?: "light" | "dark" };
  initScript?: string;
  checkCancelled: () => void;
  onProgress: () => Promise<void>;
  onStepDiffed?: (stepId: string, stepResults: Record<string, BreakpointResult>) => Promise<void>;
  prodBrowser?: Browser;
  devBrowser?: Browser;
}): Promise<Record<string, BreakpointResult>> {
  const {
    project, composition, prodBaseUrl, devBaseUrl, prefix, screenshotDir, dataBase,
    authConfig, breakpointList = [...BREAKPOINTS], credentials, contextOptions, initScript,
    checkCancelled, onProgress, onStepDiffed, prodBrowser, devBrowser,
  } = options;

  const results: Record<string, BreakpointResult> = {};

  // ── Streaming diff infrastructure ──────────────────────────────────
  // Collect captures from both sides as they arrive. When all breakpoints
  // for a step are ready on prod AND dev, kick off the diff immediately.
  type ShotMap = Map<string, Map<number, import("./micro-test-runner").MicroTestStepResult>>;
  const prodMap: ShotMap = new Map();
  const devMap: ShotMap = new Map();
  const diffedSteps = new Set<string>();
  // Serialise diff+flush so concurrent callbacks don't race on the
  // report.json write.
  let diffChain = Promise.resolve();

  const screenshotSteps = getCompositionScreenshotSteps(project, composition);
  const bpCount = breakpointList.length;

  /** Diff a single step (all breakpoints in parallel). Returns the
   *  per-breakpoint results and calls `onStepDiffed` for flushing. */
  const diffStep = async (stepId: string) => {
    const stepResults: Record<string, BreakpointResult> = {};

    await Promise.all(breakpointList.map(async (bp) => {
      checkCancelled();

      const prodShot = prodMap.get(stepId)?.get(bp);
      const devShot = devMap.get(stepId)?.get(bp);

      if (prodShot && devShot) {
        const diffPath = path.join(screenshotDir, `diff-comp-${composition.id}-${stepId}${prefix}-${bp}.png`);
        const alignedProdPath = path.join(screenshotDir, `aligned-prod-comp-${composition.id}-${stepId}${prefix}-${bp}.png`);
        const alignedDevPath = path.join(screenshotDir, `aligned-dev-comp-${composition.id}-${stepId}${prefix}-${bp}.png`);
        const highlightPath = path.join(screenshotDir, `highlight-comp-${composition.id}-${stepId}${prefix}-${bp}.png`);

        const diffResult = await generateDiff(
          prodShot.filePath,
          devShot.filePath,
          diffPath,
          alignedProdPath,
          alignedDevPath,
          undefined,
          highlightPath,
        );

        const bpResult: BreakpointResult = {
          prodScreenshot: path.relative(dataBase, prodShot.filePath),
          devScreenshot: path.relative(dataBase, devShot.filePath),
          diffScreenshot: path.relative(dataBase, diffPath),
          alignedProdScreenshot: path.relative(dataBase, alignedProdPath),
          alignedDevScreenshot: path.relative(dataBase, alignedDevPath),
          highlightScreenshot: diffResult.highlightImagePath
            ? path.relative(dataBase, diffResult.highlightImagePath) : undefined,
          prodUrl: prodShot.url,
          devUrl: devShot.url,
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
            bpResult.changeCount = Math.max(bpResult.pixelChangeCount ?? 0, semanticResult.issueCount);
          } catch (err) {
            console.error(`Semantic diff failed for composition "${composition.name}" step "${stepId}" at ${bp}px:`, err);
          }
        }

        stepResults[String(bp)] = bpResult;
        results[`${stepId}-${bp}`] = bpResult;
      }

      await onProgress();
    }));

    if (onStepDiffed) await onStepDiffed(stepId, stepResults);
  };

  /** Called after each screenshot capture. When a step has all
   *  breakpoints on both sides, queue its diff. */
  const tryDiffStep = (stepId: string) => {
    if (diffedSteps.has(stepId)) return;
    const pMap = prodMap.get(stepId);
    const dMap = devMap.get(stepId);
    if (!pMap || !dMap) return;
    if (pMap.size < bpCount || dMap.size < bpCount) return;
    // All breakpoints ready on both sides — diff now.
    diffedSteps.add(stepId);
    // Chain so diffs don't race on report.json writes.
    const p = diffChain.then(() => diffStep(stepId));
    diffChain = p.catch(() => {});
  };

  const recordCapture = (map: ShotMap, result: import("./micro-test-runner").MicroTestStepResult) => {
    let bpMap = map.get(result.stepId);
    if (!bpMap) { bpMap = new Map(); map.set(result.stepId, bpMap); }
    bpMap.set(result.breakpoint, result);
    tryDiffStep(result.stepId);
  };

  // ── Run prod and dev in parallel, streaming captures ───────────────
  checkCancelled();
  await Promise.all([
    executeTestComposition({
      project,
      composition,
      baseUrl: prodBaseUrl,
      breakpoints: breakpointList,
      outputDir: screenshotDir,
      prefix: `prod-comp-${composition.id}${prefix}`,
      authConfig: authConfig.prod,
      contextOptions,
      initScript,
      credentials,
      browser: prodBrowser,
      onProgress: async () => {
        checkCancelled();
        await onProgress();
      },
      onStepCaptured: (result) => recordCapture(prodMap, result),
    }),
    executeTestComposition({
      project,
      composition,
      baseUrl: devBaseUrl,
      breakpoints: breakpointList,
      outputDir: screenshotDir,
      prefix: `dev-comp-${composition.id}${prefix}`,
      authConfig: authConfig.dev,
      contextOptions,
      initScript,
      credentials,
      browser: devBrowser,
      onProgress: async () => {
        checkCancelled();
        await onProgress();
      },
      onStepCaptured: (result) => recordCapture(devMap, result),
    }),
  ]);

  // ── Cleanup: diff any steps that weren't caught by streaming ───────
  // (e.g. if a breakpoint failed on one side, the step wouldn't have
  //  triggered via tryDiffStep — diff what we have.)
  for (const step of screenshotSteps) {
    if (!diffedSteps.has(step.id)) {
      diffedSteps.add(step.id);
      const p = diffChain.then(() => diffStep(step.id));
      diffChain = p.catch(() => {});
    }
  }

  // Wait for all queued diffs to finish.
  await diffChain;

  return results;
}
