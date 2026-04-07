import { chromium, type BrowserContextOptions, type Page } from "playwright";
import path from "path";
import { ensureDir } from "./data";
import { extractDomSnapshot } from "./dom-snapshot";
import type { DomSnapshot, FlowEntry, FlowAction } from "./types";
import type { AuthCookieConfig } from "./auth-token";

/**
 * Returns the list of step IDs that will produce screenshots for a flow.
 * Used by report-runner.ts to compute progress totals and match results.
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
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}

export interface FlowScreenshotResult {
  stepId: string;
  label: string;
  breakpoint: number;
  filePath: string;
  domSnapshot?: DomSnapshot;
}

/**
 * Execute a flow (scripted browser interaction sequence) and capture
 * screenshots after each step (unless captureScreenshot is false).
 *
 * Maintains a single browser context per breakpoint so that state
 * (form data, navigation, cookies) accumulates across steps.
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
}): Promise<FlowScreenshotResult[]> {
  const {
    flow, baseUrl, breakpoints, outputDir, prefix,
    authConfig, contextOptions, initScript, onProgress,
  } = options;
  await ensureDir(outputDir);

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu"],
  });

  const results: FlowScreenshotResult[] = [];

  try {
    for (const bp of breakpoints) {
      const context = await browser.newContext({
        viewport: { width: bp, height: 900 },
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
        ...contextOptions,
        ...(authConfig
          ? {
              storageState: {
                cookies: [
                  {
                    name: authConfig.cookieName,
                    value: authConfig.cookieValue,
                    domain: authConfig.domain,
                    path: "/",
                    httpOnly: true,
                    sameSite: "Lax" as const,
                    secure: authConfig.cookieName.startsWith("__Secure-"),
                    expires: Math.floor(Date.now() / 1000) + 3600,
                  },
                ],
                origins: [],
              },
            }
          : {}),
      });

      if (initScript) {
        await context.addInitScript(initScript);
      }

      const page = await context.newPage();

      try {
        // Navigate to start path
        const startUrl = `${baseUrl.replace(/\/$/, "")}${flow.startPath}`;
        await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await Promise.race([
          page.waitForLoadState("networkidle"),
          page.waitForTimeout(5000),
        ]);

        // Execute each step
        for (const step of flow.steps) {
          if (step.type === "screenshot") {
            // Legacy standalone screenshot step — always capture
            await captureStepScreenshot(page, step.id, step.label, bp, outputDir, prefix, results);
            await onProgress?.(step.id, bp);
          } else {
            // Execute the action
            await executeAction(page, step, baseUrl);

            // Capture screenshot after the action (default: yes)
            if (step.captureScreenshot !== false) {
              const label = stepLabel(step);
              await captureStepScreenshot(page, step.id, label, bp, outputDir, prefix, results);
              await onProgress?.(step.id, bp);
            }
          }
        }
      } catch (err) {
        console.error(`Flow "${flow.name}" failed at ${bp}px:`, err);
        // Partial results are returned — other breakpoints continue
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  return results;
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
  await prepareForScreenshot(page);

  const filePath = path.join(outputDir, `${prefix}-${stepId}-${bp}.png`);
  await page.screenshot({ fullPage: true, path: filePath });

  let domSnapshot: DomSnapshot | undefined;
  try {
    domSnapshot = await extractDomSnapshot(page, page.url(), bp);
  } catch (err) {
    console.error(`Flow DOM snapshot failed at step "${label}" ${bp}px:`, err);
  }

  results.push({ stepId, label, breakpoint: bp, filePath, domSnapshot });
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
      await page.click(step.selector, { timeout: TIMEOUT });
      // Brief settle after click for transitions/navigation
      await page.waitForTimeout(500);
      break;

    case "fill":
      await page.fill(step.selector, step.value, { timeout: TIMEOUT });
      break;

    case "wait":
      await page.waitForTimeout(step.ms);
      break;

    case "waitForSelector":
      await page.waitForSelector(step.selector, { timeout: TIMEOUT });
      break;

    case "navigate": {
      const url = `${baseUrl.replace(/\/$/, "")}${step.path}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await Promise.race([
        page.waitForLoadState("networkidle"),
        page.waitForTimeout(5000),
      ]);
      break;
    }
  }
}

/**
 * Prepare page for a clean screenshot capture.
 * Mirrors the prep logic from screenshot.ts.
 */
async function prepareForScreenshot(page: Page): Promise<void> {
  // Kill animations/transitions
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation: none !important;
      transition: none !important;
      scroll-behavior: auto !important;
    }`,
  });

  // Auto-scroll to trigger lazy loading
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(timer);
        resolve();
      }, 15000);
    });
    window.scrollTo(0, 0);
  });

  // Wait for web fonts
  await page.evaluate(() => document.fonts.ready);

  // Settle time
  await page.waitForTimeout(500);
}
