import type { Browser, BrowserContextOptions, Page } from "playwright";
import type { AuthCookieConfig } from "./auth-token";

/**
 * Build BrowserContext options with optional auth cookie injection.
 */
export function buildContextOptions(
  bp: number,
  authConfig?: AuthCookieConfig,
  extra?: Partial<BrowserContextOptions>,
): BrowserContextOptions {
  return {
    viewport: { width: bp, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    ...extra,
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
  };
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
 * Reset every scrollable container to the top and let its content flow into
 * the document. Pages with an inner scrolling region (a modal whose body
 * scrolls inside a 100vh shell, for instance) otherwise come out of
 * Playwright's `fullPage: true` capped at the viewport height — and prod vs
 * dev catch them at different inner scroll positions, painting the diff
 * pink top-to-bottom for the same content. Opening the box up makes both
 * sides capture the same baseline: the full content from the top.
 */
async function expandInnerScrollers(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      const cs = getComputedStyle(el);
      const scrollableY = cs.overflowY === "auto" || cs.overflowY === "scroll";
      const scrollableX = cs.overflowX === "auto" || cs.overflowX === "scroll";
      if (!scrollableY && !scrollableX) continue;
      el.scrollTop = 0;
      el.scrollLeft = 0;
      el.style.setProperty("overflow", "visible", "important");
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
