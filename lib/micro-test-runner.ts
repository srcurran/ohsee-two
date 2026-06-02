import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright";
import path from "path";
import { TOTP, Secret } from "otpauth";
import { ensureDir } from "./data";
import { extractDomSnapshot } from "./dom-snapshot";
import { buildContextOptions, prepareForScreenshot } from "./capture-utils";
import type {
  BrowserStorageState,
  DomSnapshot,
  Project,
  ScriptCredentials,
  TestComposition,
  TestCompositionStep,
} from "./types";

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
 * Replace `$EMAIL$`, `$PASSWORD$`, `$OTP$` template variables in a script
 * with values from the resolved vault entry. Generates a fresh TOTP code
 * (or returns the static OTP) at call time so each invocation is live.
 */
function interpolateCredentials(script: string, creds: ScriptCredentials): string {
  let out = script;
  out = out.replace(/\$EMAIL\$/g, creds.email.replace(/\\/g, "\\\\").replace(/'/g, "\\'"));
  out = out.replace(/\$PASSWORD\$/g, creds.password.replace(/\\/g, "\\\\").replace(/'/g, "\\'"));

  if (out.includes("$OTP$")) {
    let otp = "";
    if (creds.staticOtp) {
      otp = creds.staticOtp;
    } else if (creds.totpSeed) {
      const totp = new TOTP({ secret: Secret.fromBase32(creds.totpSeed), digits: 6, period: 30 });
      otp = totp.generate();
    }
    out = out.replace(/\$OTP\$/g, otp);
  }

  return out;
}

/**
 * Execute a single micro-test script against a Playwright Page.
 *
 * The script string is the function *body* that receives `page` (Playwright Page)
 * and `expect` (Playwright test assertion) as arguments.
 *
 * When `credentials` is provided, `$EMAIL$`, `$PASSWORD$`, and `$OTP$`
 * template variables in the script are replaced with vault values before
 * execution. TOTP codes are generated fresh each call.
 *
 * Security note: this evals user-supplied code — acceptable for a
 * single-user self-hosted tool.
 */
export async function executeMicroTest(
  page: Page,
  script: string,
  timeout = STEP_TIMEOUT,
  baseUrl?: string,
  credentials?: ScriptCredentials,
): Promise<void> {
  let processed = rewriteGotoUrls(script, baseUrl);
  if (credentials) {
    processed = interpolateCredentials(processed, credentials);
  } else if (/\$(EMAIL|PASSWORD|OTP)\$/.test(processed)) {
    console.warn(
      "⚠ Script contains $EMAIL$/$PASSWORD$/$OTP$ template variables " +
      "but no vault credentials were provided. The literal strings will " +
      "be typed as-is. Select a vault credential in test settings to fix this.",
    );
  }

  let expectFn: unknown;
  try {
    const mod = await (Function('return import("@playwright/test")')() as Promise<{ expect: unknown }>);
    expectFn = mod.expect;
  } catch {
    // @playwright/test may not be installed — scripts that need `expect` will fail
  }

  const fn = new Function("page", "expect", `return (async () => { ${processed} })()`) as (
    page: Page,
    expect: unknown,
  ) => Promise<void>;

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Micro-test timed out after ${timeout}ms`)), timeout),
  );

  await Promise.race([fn(page, expectFn), timeoutPromise]);
}

/** One screenshot produced by an `ohsee.snapshot()` call in a script test. */
export interface ScriptSnapshotResult {
  /** 0-based order of the snapshot() call within the script — the stable key
   *  used to pair the prod capture with the dev capture. */
  index: number;
  /** Display label (the snapshot() argument, or "snapshot-N"). */
  name: string;
  breakpoint: number;
  filePath: string;
  /** URL the page was on at capture time. */
  url: string;
  domSnapshot?: DomSnapshot;
}

/** Default timeout for a whole script-test run (ms) — a full flow, not a step. */
const SCRIPT_TIMEOUT = 120_000;

/**
 * Execute one advanced-test script per breakpoint. The script is a function
 * body receiving `page`, `expect`, and `ohsee`; it drives the flow and calls
 * `await ohsee.snapshot('name')` wherever a screenshot should be taken. Runs
 * once per environment (the caller passes the prod or dev base + browser);
 * snapshots pair across environments by `index`.
 *
 * Security note: this evals user-supplied code — acceptable for a single-user
 * self-hosted tool.
 */
export async function executeScriptTest(options: {
  script: string;
  /** Prod or dev base URL — absolute page.goto() calls are rewritten to it. */
  baseUrl: string;
  breakpoints: number[];
  outputDir: string;
  /** File prefix, e.g. "prod" / "dev" (+ variant suffix). */
  prefix: string;
  contextOptions?: Partial<BrowserContextOptions>;
  initScript?: string;
  /** Vault credentials for $EMAIL$ / $PASSWORD$ / $OTP$ interpolation. */
  credentials?: ScriptCredentials;
  /** Auth storage state to start the context already signed in. */
  storageState?: BrowserStorageState;
  browser?: Browser;
  onProgress?: (index: number, breakpoint: number) => void | Promise<void>;
  onSnapshotCaptured?: (result: ScriptSnapshotResult) => void;
}): Promise<ScriptSnapshotResult[]> {
  const {
    script, baseUrl, breakpoints, outputDir, prefix, contextOptions, initScript,
    credentials, storageState, browser: externalBrowser, onProgress, onSnapshotCaptured,
  } = options;
  await ensureDir(outputDir);

  let processed = rewriteGotoUrls(script, baseUrl);
  if (credentials) {
    processed = interpolateCredentials(processed, credentials);
  } else if (/\$(EMAIL|PASSWORD|OTP)\$/.test(processed)) {
    console.warn(
      "⚠ Script uses $EMAIL$/$PASSWORD$/$OTP$ but no vault credentials were " +
      "provided — the literal strings will be typed as-is.",
    );
  }

  let expectFn: unknown;
  try {
    const mod = await (Function('return import("@playwright/test")')() as Promise<{ expect: unknown }>);
    expectFn = mod.expect;
  } catch {
    // @playwright/test may be absent — scripts needing `expect` will fail.
  }

  const browser = externalBrowser ?? await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu"],
  });

  try {
    const perBp = await Promise.all(breakpoints.map(async (bp) => {
      const bpResults: ScriptSnapshotResult[] = [];
      let context;
      try {
        context = await browser.newContext(
          buildContextOptions(bp, {
            // Set baseURL so relative page.goto('/path') resolves against the
            // environment base (absolute gotos are also rewritten upstream).
            baseURL: baseUrl,
            ...contextOptions,
            ...(storageState
              ? { storageState: storageState as BrowserContextOptions["storageState"] }
              : {}),
          }),
        );
        if (initScript) await context.addInitScript(initScript);
        const page = await context.newPage();

        // `ohsee.snapshot()` — the in-script capture hook. Each call screenshots
        // the current page; index keeps prod/dev pairs aligned.
        let snapIndex = 0;
        const ohsee = {
          snapshot: async (name?: string) => {
            const index = snapIndex++;
            await prepareForScreenshot(page, 500);
            const filePath = path.join(outputDir, `${prefix}-${index}-${bp}.png`);
            await page.screenshot({ fullPage: true, path: filePath });
            const url = page.url();
            let domSnapshot: DomSnapshot | undefined;
            try {
              domSnapshot = await extractDomSnapshot(page, url, bp);
            } catch (err) {
              console.error(`Script snapshot DOM extract failed at ${bp}px:`, err);
            }
            const result: ScriptSnapshotResult = {
              index, name: name || `snapshot-${index + 1}`, breakpoint: bp, filePath, url, domSnapshot,
            };
            bpResults.push(result);
            onSnapshotCaptured?.(result);
            await onProgress?.(index, bp);
          },
        };

        const fn = new Function(
          "page", "expect", "ohsee",
          `return (async () => { ${processed} })()`,
        ) as (page: Page, expect: unknown, ohsee: unknown) => Promise<void>;

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Script timed out after ${SCRIPT_TIMEOUT}ms`)), SCRIPT_TIMEOUT),
        );
        await Promise.race([fn(page, expectFn, ohsee), timeoutPromise]);
      } catch (err) {
        // Keep whatever snapshots were captured before the failure.
        console.error(`Script test failed at ${bp}px:`, err);
      } finally {
        await context?.close().catch(() => {});
      }
      return bpResults;
    }));

    return perBp.flat();
  } finally {
    if (!externalBrowser) await browser.close();
  }
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
  contextOptions?: Partial<BrowserContextOptions>;
  initScript?: string;
  onProgress?: (stepId: string, breakpoint: number) => void | Promise<void>;
  /** Reuse an existing browser instance instead of launching a new one. */
  browser?: Browser;
  /** Vault credentials for $EMAIL$ / $PASSWORD$ / $OTP$ interpolation. */
  credentials?: ScriptCredentials;
  /** Fires after each step screenshot is captured. Used by the report
   *  runner to diff steps incrementally while captures are still in
   *  progress on other breakpoints/environments. */
  onStepCaptured?: (result: MicroTestStepResult) => void;
}): Promise<MicroTestStepResult[]> {
  const {
    project, composition, baseUrl, breakpoints, outputDir, prefix,
    contextOptions, initScript, onProgress,
    browser: externalBrowser, credentials, onStepCaptured,
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
        context = await browser.newContext(buildContextOptions(bp, contextOptions));

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
            await executeMicroTest(page, resolved.script, STEP_TIMEOUT, baseUrl, credentials);
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
              // Notify caller so it can start diffing this step's
              // breakpoint while other captures are still in flight.
              onStepCaptured?.(bpResults[bpResults.length - 1]);
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
