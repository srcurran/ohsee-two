import { chromium, type Browser } from "playwright";
import path from "path";
import { ensureDir } from "./data";

export interface ScreenshotResult {
  breakpoint: number;
  filePath: string;
}

export async function captureScreenshots(options: {
  url: string;
  breakpoints: number[];
  outputDir: string;
  prefix: string;
  onProgress?: (breakpoint: number, status: string) => void;
}): Promise<ScreenshotResult[]> {
  const { url, breakpoints, outputDir, prefix, onProgress } = options;
  await ensureDir(outputDir);

  const browser = await chromium.launch({ headless: true });
  const results: ScreenshotResult[] = [];

  try {
    for (const bp of breakpoints) {
      onProgress?.(bp, "capturing");

      const context = await browser.newContext({
        viewport: { width: bp, height: 900 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();

      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

        // Dismiss common cookie banners
        await dismissPopups(page);

        // Scroll to trigger lazy-loaded content
        await autoScroll(page);

        // Wait a bit for any final renders
        await page.waitForTimeout(500);

        const filePath = path.join(outputDir, `${prefix}-${bp}.png`);
        await page.screenshot({ fullPage: true, path: filePath });

        results.push({ breakpoint: bp, filePath });
        onProgress?.(bp, "done");
      } catch (err) {
        console.error(`Failed to capture ${url} at ${bp}px:`, err);
        onProgress?.(bp, "error");
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

async function autoScroll(page: import("playwright").Page): Promise<void> {
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
      // Safety timeout
      setTimeout(() => {
        clearInterval(timer);
        resolve();
      }, 15000);
    });
    window.scrollTo(0, 0);
  });
}

async function dismissPopups(page: import("playwright").Page): Promise<void> {
  const selectors = [
    '[aria-label*="accept" i]',
    '[aria-label*="cookie" i]',
    '[id*="cookie"] button',
    ".cookie-banner button",
    '[class*="cookie"] button',
    '[data-testid*="cookie"] button',
    'button:has-text("Accept")',
    'button:has-text("Accept All")',
    'button:has-text("Got it")',
  ];

  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await el.click();
        await page.waitForTimeout(300);
        break;
      }
    } catch {
      // ignore
    }
  }
}
