import { chromium, type Browser } from "playwright";
import path from "path";
import fs from "fs/promises";
import { ensureDir } from "./data";
import { extractDomSnapshot } from "./dom-snapshot";
import type { DomSnapshot } from "./types";

export interface ScreenshotResult {
  breakpoint: number;
  filePath: string;
  domSnapshot?: DomSnapshot;
}

export async function captureScreenshots(options: {
  url: string;
  breakpoints: number[];
  outputDir: string;
  prefix: string;
  onProgress?: (breakpoint: number, status: string) => void | Promise<void>;
}): Promise<ScreenshotResult[]> {
  const { url, breakpoints, outputDir, prefix, onProgress } = options;
  await ensureDir(outputDir);

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-gpu",
    ],
  });
  const results: ScreenshotResult[] = [];

  try {
    for (const bp of breakpoints) {
      const context = await browser.newContext({
        viewport: { width: bp, height: 900 },
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();

      try {
        // Use domcontentloaded then briefly wait for networkidle.
        // Sites with persistent connections (analytics, websockets) will
        // never reach networkidle — the 5s timeout keeps things moving.
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await Promise.race([
          page.waitForLoadState("networkidle"),
          page.waitForTimeout(5000),
        ]);

        // Kill all CSS animations and transitions for clean screenshots
        await page.addStyleTag({
          content: `*, *::before, *::after {
            animation: none !important;
            transition: none !important;
            scroll-behavior: auto !important;
          }`,
        });

        // Dismiss common cookie banners
        await dismissPopups(page);

        // Scroll to trigger lazy-loaded content
        await autoScroll(page);

        // Wait for web fonts to load
        await page.evaluate(() => document.fonts.ready);

        // General settle time for animations, transitions, lazy JS
        await page.waitForTimeout(1000);

        const filePath = path.join(outputDir, `${prefix}-${bp}.png`);
        await page.screenshot({ fullPage: true, path: filePath });

        // Extract DOM snapshot for semantic diffing
        let domSnapshot: DomSnapshot | undefined;
        try {
          domSnapshot = await extractDomSnapshot(page, url, bp);
        } catch (err) {
          console.error(`Failed to extract DOM snapshot for ${url} at ${bp}px:`, err);
        }

        results.push({ breakpoint: bp, filePath, domSnapshot });
      } catch (err) {
        console.error(`Failed to capture ${url} at ${bp}px:`, err);
      } finally {
        await context.close();
      }

      await onProgress?.(bp, "done");
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
