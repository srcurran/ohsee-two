import { chromium, type BrowserContextOptions, type Page } from "playwright";
import path from "path";
import { ensureDir } from "./data";
import { extractDomSnapshot } from "./dom-snapshot";
import type { DomSnapshot, FlowEntry, FlowAction } from "./types";
import type { AuthCookieConfig } from "./auth-token";

/**
 * If the last step in a flow isn't already a screenshot, append an
 * auto-generated "Final State" screenshot step so the user always
 * gets a capture of the end result.
 */
export function ensureFinalScreenshot(flow: FlowEntry): FlowAction[] {
  const steps = [...flow.steps];
  if (steps.length > 0 && steps[steps.length - 1].type !== "screenshot") {
    steps.push({ id: `auto-final-${flow.id}`, type: "screenshot", label: "Final State" });
  }
  return steps;
}

/**
 * Returns the list of step IDs that will produce screenshots for a flow.
 * Uses `ensureFinalScreenshot` so the auto-added final step is included
 * in progress totals and result matching.
 */
export function getScreenshotStepIds(flow: FlowEntry): { id: string; label: string }[] {
  const steps = ensureFinalScreenshot(flow);
  const result: { id: string; label: string }[] = [];
  for (const step of steps) {
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

        // Use augmented steps so a "Final State" screenshot is auto-appended
        const augmentedSteps = ensureFinalScreenshot(flow);

        // Execute each step — errors are caught per-step so one failure
        // doesn't prevent later steps from executing
        for (const step of augmentedSteps) {
          try {
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
          } catch (err) {
            console.error(`Flow "${flow.name}" step "${step.id}" (${step.type}) failed at ${bp}px:`, err);
            // Continue to next step — partial results are better than none
          }
        }
      } catch (err) {
        console.error(`Flow "${flow.name}" failed at ${bp}px (setup):`, err);
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
      // Wait for the element to appear before clicking
      await page.waitForSelector(step.selector, { state: "visible", timeout: TIMEOUT });
      await page.click(step.selector, { timeout: TIMEOUT });
      // Wait for any navigation or network activity triggered by the click
      await Promise.race([
        page.waitForLoadState("networkidle").catch(() => {}),
        page.waitForTimeout(3000),
      ]);
      break;

    case "fill":
      // Wait for the element to appear before filling
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
      // Strip domain if step.path was saved as a full URL
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
