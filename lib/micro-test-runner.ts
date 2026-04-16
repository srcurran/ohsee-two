import { chromium, type BrowserContextOptions, type Page } from "playwright";
import path from "path";
import { ensureDir } from "./data";
import { extractDomSnapshot } from "./dom-snapshot";
import type {
  DomSnapshot,
  MicroTest,
  Project,
  TestComposition,
  TestCompositionStep,
} from "./types";
import type { AuthCookieConfig } from "./auth-token";

/** Default timeout per micro-test step execution (ms). */
const STEP_TIMEOUT = 30_000;

export interface MicroTestStepResult {
  stepId: string;
  label: string;
  breakpoint: number;
  filePath: string;
  domSnapshot?: DomSnapshot;
}

/**
 * Execute a single micro-test script against a Playwright Page.
 *
 * The script string is the function *body* that receives `page` (Playwright Page)
 * and `expect` (Playwright test assertion) as arguments.
 *
 * Security note: this evals user-supplied code — acceptable for a
 * single-user self-hosted tool.
 */
/**
 * Rewrite absolute page.goto() URLs in a script so they use the given base URL.
 * This allows scripts recorded against one environment (e.g. dev) to run
 * correctly against another (e.g. prod) during report comparisons.
 *
 * Replaces: `page.goto('https://anything.com/path')` → `page.goto('https://baseUrl/path')`
 */
function rewriteGotoUrls(script: string, baseUrl: string | undefined): string {
  if (!baseUrl) return script;
  const base = baseUrl.replace(/\/$/, "");
  // Match page.goto('...') or page.goto("...") or page.goto(`...`)
  return script.replace(
    /page\.goto\s*\(\s*(['"`])(https?:\/\/[^'"`]+)\1/g,
    (_match, quote, originalUrl) => {
      try {
        const parsed = new URL(originalUrl);
        const pathAndQuery = parsed.pathname + parsed.search + parsed.hash;
        return `page.goto(${quote}${base}${pathAndQuery}${quote}`;
      } catch {
        return _match;
      }
    },
  );
}

export async function executeMicroTest(
  page: Page,
  script: string,
  timeout = STEP_TIMEOUT,
  baseUrl?: string,
): Promise<void> {
  // Rewrite any hardcoded goto URLs to use the correct base URL
  const rewrittenScript = rewriteGotoUrls(script, baseUrl);

  // Build an async function from the script body, passing `page` as argument.
  // We also pass common Playwright helpers so scripts can use `expect()`.
  let expectFn: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = await (Function('return import("@playwright/test")')() as Promise<{ expect: unknown }>);
    expectFn = mod.expect;
  } catch {
    // @playwright/test may not be installed — scripts that need `expect` will fail
  }

  const fn = new Function("page", "expect", `return (async () => { ${rewrittenScript} })()`) as (
    page: Page,
    expect: unknown,
  ) => Promise<void>;

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Micro-test timed out after ${timeout}ms`)), timeout),
  );

  await Promise.race([fn(page, expectFn), timeoutPromise]);
}

/**
 * Look up a MicroTest by ID from the project's micro-test library.
 */
function findMicroTest(project: Project, microTestId: string): MicroTest | undefined {
  return project.microTests?.find((mt) => mt.id === microTestId);
}

/**
 * Execute a full TestComposition — run each step's micro-test in sequence,
 * capturing screenshots between steps as configured.
 *
 * Follows the same browser lifecycle patterns as flow-runner:
 * one browser context per breakpoint, state accumulates across steps.
 */
export async function executeTestComposition(options: {
  project: Project;
  composition: TestComposition;
  baseUrl: string;
  breakpoints: number[];
  outputDir: string;
  prefix: string;
  authConfig?: AuthCookieConfig;
  contextOptions?: Partial<BrowserContextOptions>;
  initScript?: string;
  onProgress?: (stepId: string, breakpoint: number) => void | Promise<void>;
}): Promise<MicroTestStepResult[]> {
  const {
    project, composition, baseUrl, breakpoints, outputDir, prefix,
    authConfig, contextOptions, initScript, onProgress,
  } = options;
  await ensureDir(outputDir);

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu"],
  });

  const results: MicroTestStepResult[] = [];

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
        // Navigate to composition start path
        const startUrl = `${baseUrl.replace(/\/$/, "")}${composition.startPath}`;
        await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await Promise.race([
          page.waitForLoadState("networkidle"),
          page.waitForTimeout(5000),
        ]);

        // Execute each composition step
        for (const step of composition.steps) {
          const microTest = findMicroTest(project, step.microTestId);
          if (!microTest) {
            console.error(
              `Composition "${composition.name}" step "${step.id}": ` +
              `micro-test "${step.microTestId}" not found — skipping`,
            );
            continue;
          }

          try {
            await executeMicroTest(page, microTest.script, STEP_TIMEOUT, baseUrl);
          } catch (err) {
            console.error(
              `Composition "${composition.name}" step "${step.id}" ` +
              `(micro-test "${microTest.name}") failed at ${bp}px:`,
              err,
            );
            // Still capture screenshot below — showing page state at failure
            // is more useful than a blank
          }

          if (step.captureScreenshot) {
            try {
              await captureStepScreenshot(
                page, step.id, microTest.displayName, bp, outputDir, prefix, results,
              );
            } catch (screenshotErr) {
              console.error(
                `Screenshot capture failed for step "${step.id}" at ${bp}px:`,
                screenshotErr,
              );
            }
            await onProgress?.(step.id, bp);
          }
        }

        // Always capture a final state screenshot
        const finalId = `auto-final-${composition.id}`;
        await captureStepScreenshot(
          page, finalId, "Final State", bp, outputDir, prefix, results,
        );
        await onProgress?.(finalId, bp);
      } catch (err) {
        console.error(`Composition "${composition.name}" failed at ${bp}px (setup):`, err);
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
 * Returns the list of step IDs that will produce screenshots for a composition.
 * Includes the auto-appended final state screenshot.
 */
export function getCompositionScreenshotSteps(
  project: Project,
  composition: TestComposition,
): { id: string; label: string }[] {
  const result: { id: string; label: string }[] = [];

  for (const step of composition.steps) {
    if (step.captureScreenshot) {
      const microTest = findMicroTest(project, step.microTestId);
      result.push({
        id: step.id,
        label: microTest?.displayName ?? `Step ${step.id}`,
      });
    }
  }

  // Auto-appended final state
  result.push({ id: `auto-final-${composition.id}`, label: "Final State" });

  return result;
}

/**
 * Capture a screenshot for a step, pushing the result to the array.
 * Mirrors the logic from flow-runner.
 */
async function captureStepScreenshot(
  page: Page,
  stepId: string,
  label: string,
  bp: number,
  outputDir: string,
  prefix: string,
  results: MicroTestStepResult[],
): Promise<void> {
  await prepareForScreenshot(page);

  const filePath = path.join(outputDir, `${prefix}-${stepId}-${bp}.png`);
  await page.screenshot({ fullPage: true, path: filePath });

  let domSnapshot: DomSnapshot | undefined;
  try {
    domSnapshot = await extractDomSnapshot(page, page.url(), bp);
  } catch (err) {
    console.error(`Composition DOM snapshot failed at step "${label}" ${bp}px:`, err);
  }

  results.push({ stepId, label, breakpoint: bp, filePath, domSnapshot });
}

/**
 * Prepare page for a clean screenshot capture.
 * Mirrors the prep logic from flow-runner / screenshot.ts.
 */
async function prepareForScreenshot(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation: none !important;
      transition: none !important;
      scroll-behavior: auto !important;
    }`,
  });

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

  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}
