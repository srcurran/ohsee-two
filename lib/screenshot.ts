import { chromium, type Browser, type BrowserContextOptions } from "playwright";
import path from "path";
import { ensureDir } from "./data";
import { extractDomSnapshot } from "./dom-snapshot";
import { buildContextOptions, prepareForScreenshot } from "./capture-utils";
import type { DomSnapshot } from "./types";

export interface ScreenshotResult {
  breakpoint: number;
  filePath: string;
  /** The URL the page actually settled on (after any redirects) when the screenshot was taken. */
  url: string;
  domSnapshot?: DomSnapshot;
}

export async function captureScreenshots(options: {
  url: string;
  breakpoints: number[];
  outputDir: string;
  prefix: string;
  /** Extra context options (e.g., colorScheme for dark mode) */
  contextOptions?: Partial<BrowserContextOptions>;
  /** JS to run before every page load (e.g., localStorage theme injection) */
  initScript?: string;
  onProgress?: (breakpoint: number, status: string) => void | Promise<void>;
  /** Reuse an existing browser instance instead of launching a new one. */
  browser?: Browser;
}): Promise<ScreenshotResult[]> {
  const { url, breakpoints, outputDir, prefix, contextOptions, initScript, onProgress, browser: externalBrowser } = options;
  await ensureDir(outputDir);

  const browser = externalBrowser ?? await chromium.launch({
    headless: true,
    args: [
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-gpu",
    ],
  });

  try {
    const settled = await Promise.all(breakpoints.map(async (bp) => {
      let context;
      try {
        context = await browser.newContext(buildContextOptions(bp, contextOptions));

        if (initScript) {
          await context.addInitScript(initScript);
        }

        const page = await context.newPage();

        // Use domcontentloaded then briefly wait for networkidle.
        // Sites with persistent connections (analytics, websockets) will
        // never reach networkidle — the 5s timeout keeps things moving.
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await Promise.race([
          page.waitForLoadState("networkidle"),
          page.waitForTimeout(5000),
        ]);

        await prepareForScreenshot(page);

        const filePath = path.join(outputDir, `${prefix}-${bp}.png`);
        await page.screenshot({ fullPage: true, path: filePath });

        const capturedUrl = page.url();

        let domSnapshot: DomSnapshot | undefined;
        try {
          domSnapshot = await extractDomSnapshot(page, capturedUrl, bp);
        } catch (err) {
          console.error(`Failed to extract DOM snapshot for ${capturedUrl} at ${bp}px:`, err);
        }

        return { breakpoint: bp, filePath, url: capturedUrl, domSnapshot } as ScreenshotResult;
      } catch (err) {
        console.error(`Failed to capture ${url} at ${bp}px:`, err);
        return null;
      } finally {
        await context?.close().catch(() => {});
        await onProgress?.(bp, "done");
      }
    }));

    return settled.filter((r): r is ScreenshotResult => r !== null);
  } finally {
    if (!externalBrowser) {
      await browser.close();
    }
  }
}
