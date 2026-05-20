import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright";
import path from "path";
import { ensureDir } from "./data";
import { extractDomSnapshot } from "./dom-snapshot";
import { buildContextOptions, prepareForScreenshot } from "./capture-utils";
import type {
  DomSnapshot,
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
  /** The URL Playwright was on at the moment of capture (post-navigation). */
  url: string;
  domSnapshot?: DomSnapshot;
}

/**
 * Rewrite absolute page.goto() URLs in a script so they use the given base URL.
 * This allows scripts recorded against one environment (e.g. dev) to run
 * correctly against another (e.g. prod) during report comparisons.
 */
function rewriteGotoUrls(script: string, baseUrl: string | undefined): string {
  if (!baseUrl) return script;
  const base = baseUrl.replace(/\/$/, "");
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

/**
 * Execute a single micro-test script against a Playwright Page.
 *
 * The script string is the function *body* that receives `page` (Playwright Page)
 * and `expect` (Playwright test assertion) as arguments.
 *
 * Security note: this evals user-supplied code — acceptable for a
 * single-user self-hosted tool.
 */
export async function executeMicroTest(
  page: Page,
  script: string,
  timeout = STEP_TIMEOUT,
  baseUrl?: string,
): Promise<void> {
  const rewrittenScript = rewriteGotoUrls(script, baseUrl);

  let expectFn: unknown;
  try {
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
 * Resolve a step's script + display name. Prefers inline `step.script` /
 * `step.name` (post-migration shape). Falls back to looking up
 * `step.microTestId` in `project.microTests` for unmigrated tests.
 */
function resolveStepScript(
  project: Project,
  step: TestCompositionStep,
): { script: string; displayName: string } | null {
  if (step.script) {
    return { script: step.script, displayName: step.name ?? step.id };
  }
  if (step.microTestId) {
    const mt = project.microTests?.find((m) => m.id === step.microTestId);
    if (mt) return { script: mt.script, displayName: mt.displayName };
  }
  return null;
}

/**
 * Execute a full TestComposition — run each step's micro-test in sequence,
 * capturing screenshots between steps as configured.
 *
 * Follows the same browser lifecycle patterns as flow-runner:
 * one browser context per breakpoint, state accumulates across steps.
 * Breakpoints are executed in parallel.
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
  /** Reuse an existing browser instance instead of launching a new one. */
  browser?: Browser;
}): Promise<MicroTestStepResult[]> {
  const {
    project, composition, baseUrl, breakpoints, outputDir, prefix,
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
      const bpResults: MicroTestStepResult[] = [];
      let context;
      try {
        context = await browser.newContext(buildContextOptions(bp, authConfig, contextOptions));

        if (initScript) {
          await context.addInitScript(initScript);
        }

        const page = await context.newPage();

        const startUrl = `${baseUrl.replace(/\/$/, "")}${composition.startPath}`;
        await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await Promise.race([
          page.waitForLoadState("networkidle"),
          page.waitForTimeout(5000),
        ]);

        for (const step of composition.steps) {
          const resolved = resolveStepScript(project, step);
          if (!resolved) {
            console.error(
              `Composition "${composition.name}" step "${step.id}": ` +
              `no script (microTestId="${step.microTestId ?? "?"}") — skipping`,
            );
            continue;
          }

          try {
            await executeMicroTest(page, resolved.script, STEP_TIMEOUT, baseUrl);
          } catch (err) {
            console.error(
              `Composition "${composition.name}" step "${step.id}" ` +
              `("${resolved.displayName}") failed at ${bp}px:`,
              err,
            );
          }

          await Promise.race([
            page.waitForLoadState("networkidle"),
            page.waitForTimeout(3000),
          ]);

          if (step.captureScreenshot) {
            try {
              await captureStepScreenshot(
                page, step.id, resolved.displayName, bp, outputDir, prefix, bpResults,
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
      } catch (err) {
        console.error(`Composition "${composition.name}" failed at ${bp}px (setup):`, err);
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
 * Returns the list of step IDs that will produce screenshots for a composition.
 */
export function getCompositionScreenshotSteps(
  project: Project,
  composition: TestComposition,
): { id: string; label: string }[] {
  const result: { id: string; label: string }[] = [];

  for (const step of composition.steps) {
    if (step.captureScreenshot) {
      const resolved = resolveStepScript(project, step);
      result.push({
        id: step.id,
        label: resolved?.displayName ?? `Step ${step.id}`,
      });
    }
  }

  return result;
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
  results: MicroTestStepResult[],
): Promise<void> {
  await prepareForScreenshot(page, 500);

  const filePath = path.join(outputDir, `${prefix}-${stepId}-${bp}.png`);
  await page.screenshot({ fullPage: true, path: filePath });

  const capturedUrl = page.url();

  let domSnapshot: DomSnapshot | undefined;
  try {
    domSnapshot = await extractDomSnapshot(page, capturedUrl, bp);
  } catch (err) {
    console.error(`Composition DOM snapshot failed at step "${label}" ${bp}px:`, err);
  }

  results.push({ stepId, label, breakpoint: bp, filePath, url: capturedUrl, domSnapshot });
}
