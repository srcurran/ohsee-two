import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright";
import path from "path";
import { ensureDir } from "./data";
import { extractDomSnapshot } from "./dom-snapshot";
import { buildContextOptions, prepareForScreenshot } from "./capture-utils";
import type { DomSnapshot, FlowEntry, FlowAction } from "./types";
import type { AuthCookieConfig } from "./auth-token";

/**
 * Returns the list of step IDs that will produce screenshots for a flow.
 */
export function getScreenshotStepIds(flow: FlowEntry): { id: string; label: string }[] {
  const result: { id: string; label: string }[] = [];
  for (const step of flow.steps) {
    if (step.type === "screenshot") {
      result.push({ id: step.id, label: step.label });
    } else if (step.captureScreenshot !== false) {
      result.push({ id: step.id, label: stepLabel(step) });
    }
  }
  return result;
}

/** Generate a human-readable label for an action step's screenshot. */
function stepLabel(step: FlowAction): string {
  switch (step.type) {
    case "click":
      return `Click: ${truncate(step.selector, 40)}`;
    case "fill":
      return `Fill: ${truncate(step.selector, 30)}`;
    case "navigate":
      return step.path;
    case "wait":
      return `Wait ${step.ms}ms`;
    case "waitForSelector":
      return `Wait: ${truncate(step.selector, 40)}`;
    case "screenshot":
      return step.label;
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export interface FlowScreenshotResult {
  stepId: string;
  label: string;
  breakpoint: number;
  filePath: string;
  /** The URL Playwright was on at the moment of capture (post-navigation). */
  url: string;
  domSnapshot?: DomSnapshot;
}

/**
 * Execute a flow (scripted browser interaction sequence) and capture
 * screenshots after each step (unless captureScreenshot is false).
 *
 * Maintains a single browser context per breakpoint so that state
 * (form data, navigation, cookies) accumulates across steps.
 * Breakpoints are executed in parallel.
 */
export async function executeFlow(options: {
  flow: FlowEntry;
  baseUrl: string;
  breakpoints: number[];
  outputDir: string;
  /** File prefix, e.g., "prod-flow-{flowId}" or "dev-flow-{flowId}" */
  prefix: string;
  authConfig?: AuthCookieConfig;
  contextOptions?: Partial<BrowserContextOptions>;
  initScript?: string;
  onProgress?: (stepId: string, breakpoint: number) => void | Promise<void>;
  /** Reuse an existing browser instance instead of launching a new one. */
  browser?: Browser;
}): Promise<FlowScreenshotResult[]> {
  const {
    flow, baseUrl, breakpoints, outputDir, prefix,
    authConfig, contextOptions, initScript, onProgress,
    browser: externalBrowser,
  } = options;
  await ensureDir(outputDir);

  const browser = externalBrowser ?? await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu"],
  });

  try {
    const perBp = await Promise.all(breakpoints.map(async (bp) => {
      const bpResults: FlowScreenshotResult[] = [];
      let context;
      try {
        context = await browser.newContext(buildContextOptions(bp, authConfig, contextOptions));

        if (initScript) {
          await context.addInitScript(initScript);
        }

        const page = await context.newPage();

        // Navigate to start path — strip domain if startPath was saved as a full URL
        const startPathNorm = flow.startPath.match(/^https?:\/\//)
          ? new URL(flow.startPath).pathname
          : flow.startPath;
        const startUrl = `${baseUrl.replace(/\/$/, "")}${startPathNorm}`;
        await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await Promise.race([
          page.waitForLoadState("networkidle"),
          page.waitForTimeout(5000),
        ]);

        // Execute each step — errors are caught per-step so one failure
        // doesn't prevent later steps from executing
        for (const step of flow.steps) {
          try {
            if (step.type === "screenshot") {
              await captureStepScreenshot(page, step.id, step.label, bp, outputDir, prefix, bpResults);
              await onProgress?.(step.id, bp);
            } else {
              await executeAction(page, step, baseUrl);
              if (step.captureScreenshot !== false) {
                const label = stepLabel(step);
                await captureStepScreenshot(page, step.id, label, bp, outputDir, prefix, bpResults);
                await onProgress?.(step.id, bp);
              }
            }
          } catch (err) {
            console.error(`Flow "${flow.name}" step "${step.id}" (${step.type}) failed at ${bp}px:`, err);
          }
        }
      } catch (err) {
        console.error(`Flow "${flow.name}" failed at ${bp}px (setup):`, err);
      } finally {
        await context?.close().catch(() => {});
      }
      return bpResults;
    }));

    return perBp.flat();
  } finally {
    if (!externalBrowser) {
      await browser.close();
    }
  }
}

/**
 * Capture a screenshot for a step, pushing the result to the array.
 */
async function captureStepScreenshot(
  page: Page,
  stepId: string,
  label: string,
  bp: number,
  outputDir: string,
  prefix: string,
  results: FlowScreenshotResult[],
): Promise<void> {
  await prepareForScreenshot(page, 500);

  const filePath = path.join(outputDir, `${prefix}-${stepId}-${bp}.png`);
  await page.screenshot({ fullPage: true, path: filePath });

  const capturedUrl = page.url();

  let domSnapshot: DomSnapshot | undefined;
  try {
    domSnapshot = await extractDomSnapshot(page, capturedUrl, bp);
  } catch (err) {
    console.error(`Flow DOM snapshot failed at step "${label}" ${bp}px:`, err);
  }

  results.push({ stepId, label, breakpoint: bp, filePath, url: capturedUrl, domSnapshot });
}

/**
 * Execute a single non-screenshot flow action.
 */
async function executeAction(
  page: Page,
  step: Exclude<FlowAction, { type: "screenshot" }>,
  baseUrl: string,
): Promise<void> {
  const TIMEOUT = 10000;

  switch (step.type) {
    case "click":
      await page.waitForSelector(step.selector, { state: "visible", timeout: TIMEOUT });
      await page.click(step.selector, { timeout: TIMEOUT });
      await Promise.race([
        page.waitForLoadState("networkidle").catch(() => {}),
        page.waitForTimeout(3000),
      ]);
      break;

    case "fill":
      await page.waitForSelector(step.selector, { state: "visible", timeout: TIMEOUT });
      await page.fill(step.selector, step.value, { timeout: TIMEOUT });
      break;

    case "wait":
      await page.waitForTimeout(step.ms);
      break;

    case "waitForSelector":
      await page.waitForSelector(step.selector, { timeout: TIMEOUT });
      break;

    case "navigate": {
      const stepPathNorm = step.path.match(/^https?:\/\//)
        ? new URL(step.path).pathname
        : step.path;
      const url = `${baseUrl.replace(/\/$/, "")}${stepPathNorm}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await Promise.race([
        page.waitForLoadState("networkidle"),
        page.waitForTimeout(5000),
      ]);
      break;
    }
  }
}
