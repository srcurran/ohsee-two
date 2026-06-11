import type { BrowserContextOptions, Page } from "playwright";

/**
 * Build BrowserContext options for a breakpoint.
 */
export function buildContextOptions(
  bp: number,
  extra?: Partial<BrowserContextOptions>,
): BrowserContextOptions {
  return {
    viewport: { width: bp, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    // Grant clipboard access so copy-to-clipboard flows (and the success
    // toasts / UI they trigger) actually fire under headless capture instead
    // of silently rejecting.
    permissions: ["clipboard-read", "clipboard-write"],
    ...extra,
  };
}

/**
 * Query param appended to bust CDN edge caches on capture. Hosts like Webflow
 * staging sit behind Cloudflare, which keys its HTML edge cache on the full
 * URL (path + query). A plain capture request gets a cached HIT and comes out
 * stale even though the page is live in a browser — and a client
 * `Cache-Control: no-cache` header doesn't help, since Cloudflare ignores it
 * for already-cached HTML. A never-before-seen query value is a guaranteed
 * cache MISS, forcing a fresh pull from origin.
 */
export const CACHE_BUST_PARAM = "_ohsee_cb";

/** A token unique per run, so each capture forces a fresh edge miss. */
export function makeCacheBustToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Append the cache-bust param, preserving any existing query string. */
export function withCacheBust(rawUrl: string, token: string): string {
  try {
    const u = new URL(rawUrl);
    u.searchParams.set(CACHE_BUST_PARAM, token);
    return u.toString();
  } catch {
    // Not an absolute URL — leave it untouched for baseURL resolution.
    return rawUrl;
  }
}

/** Strip the cache-bust param so stored/displayed URLs stay clean. */
export function stripCacheBust(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.searchParams.delete(CACHE_BUST_PARAM);
    return u.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Prepare a page for a clean screenshot capture:
 * kill animations, expand inner scrollers so fullPage catches their
 * content, scroll to trigger lazy content, wait for fonts.
 */
export async function prepareForScreenshot(page: Page, settleMs = 1000): Promise<void> {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation: none !important;
      transition: none !important;
      scroll-behavior: auto !important;
    }`,
  });

  await dismissPopups(page);
  await expandInnerScrollers(page);
  await autoScroll(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(settleMs);
}

/**
 * Reset vertically scrollable containers to the top and let their content
 * flow into the document. Pages with an inner scrolling region (a modal
 * whose body scrolls inside a 100vh shell, for instance) otherwise come
 * out of Playwright's `fullPage: true` capped at the viewport height —
 * and prod vs dev catch them at different inner scroll positions, painting
 * the diff pink top-to-bottom for the same content. Opening the vertical
 * box up makes both sides capture the same baseline.
 *
 * Horizontal scrolling is left alone: a row carousel, sticky logo strip,
 * or marquee with `overflow-x: hidden` is part of the legitimate visual
 * layout, and unbleeding it floods the page with overlapping content.
 */
async function expandInnerScrollers(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      const cs = getComputedStyle(el);
      if (cs.overflowY !== "auto" && cs.overflowY !== "scroll") continue;
      el.scrollTop = 0;
      // Only the vertical axis is opened — overflow-x stays untouched so
      // horizontal carousels and clipping containers keep their layout.
      el.style.setProperty("overflow-y", "visible", "important");
      el.style.setProperty("max-height", "none", "important");
      // A fixed height (e.g. 100vh on a modal shell) still caps the box;
      // let it grow to its content so the inner cards extend into flow.
      if (cs.height !== "auto") {
        el.style.setProperty("height", "auto", "important");
      }
    }
  });
}

async function autoScroll(page: Page): Promise<void> {
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
}

async function dismissPopups(page: Page): Promise<void> {
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
