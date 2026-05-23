import type { Page } from "playwright";
import type { CapturedElement, DomSnapshot } from "./types";

// Captures content identity (alt / aria-label / src / placeholder)
// alongside layout, so change descriptions can name elements by what they
// are and matching can anchor text-less controls.

/**
 * Significant tags to capture - semantic/content elements that carry
 * meaningful visual properties worth comparing.
 */
const SIGNIFICANT_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "a", "button", "span",
  "img", "video", "svg", "picture",
  "section", "article", "main", "header", "footer", "nav", "aside",
  "ul", "ol", "li",
  "form", "input", "textarea", "select", "label",
  "table", "tr", "td", "th", "thead", "tbody",
  "figure", "figcaption", "blockquote",
  "hr",
]);

/**
 * The extraction function that runs inside Playwright's page context.
 * Must be self-contained (no closures over Node variables).
 */
function extractElementsInPage(significantTags: string[]): CapturedElement[] {
  const SIG = new Set(significantTags);
  const results: CapturedElement[] = [];

  function getDirectText(el: Element): string {
    let text = "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || "";
      }
    }
    return text.trim().substring(0, 200);
  }

  function buildSelector(el: Element): string {
    const parts: string[] = [];
    let current: Element | null = el;
    while (current && current !== document.body && current !== document.documentElement) {
      let part = current.tagName.toLowerCase();
      if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
        parts.unshift(`#${current.id}`);
        break;
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === current!.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          part += `:nth-of-type(${index})`;
        }
      }
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(" > ");
  }

  function isSignificant(el: Element): boolean {
    const tag = el.tagName.toLowerCase();
    if (SIG.has(tag)) return true;
    if (el.id) return true;
    if (el.getAttribute("role")) return true;
    if (el.getAttribute("data-testid")) return true;
    return false;
  }

  function isVisible(el: Element, cs: CSSStyleDeclaration, rect: DOMRect): boolean {
    if (rect.width === 0 && rect.height === 0) return false;
    if (cs.display === "none") return false;
    if (cs.visibility === "hidden") return false;
    if (parseFloat(cs.opacity) === 0) return false;
    return true;
  }

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const allElements = document.querySelectorAll("*");

  for (const el of allElements) {
    const tag = el.tagName.toLowerCase();

    // Skip SVG internals — <g>, <path>, <rect>, etc. are graphics primitives,
    // not page structure. Webflow/Figma exports give them ids ("HouseLine",
    // "Vector") that would otherwise sneak past the significance filter and
    // surface as "Restructured element" noise whenever the icon's internal
    // child order shifts. The <svg> element itself stays captured.
    if (tag !== "svg" && el.closest("svg")) continue;

    const sig = isSignificant(el);

    // For non-significant elements (mainly divs), check if they are
    // flex/grid containers — those carry layout props like gap that matter
    if (!sig) {
      if (tag !== "div") continue;
      const display = getComputedStyle(el).display;
      if (display !== "flex" && display !== "inline-flex" && display !== "grid" && display !== "inline-grid") continue;
    }

    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const visible = isVisible(el, cs, rect);

    // Skip invisible elements with no area
    if (!visible && rect.width === 0 && rect.height === 0) continue;

    // Content identity beyond text — for content-based change descriptions.
    const entry: CapturedElement = {
      selector: buildSelector(el),
      tag: el.tagName.toLowerCase(),
      bounds: {
        x: Math.round(rect.left + scrollX),
        y: Math.round(rect.top + scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      styles: {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        fontFamily: cs.fontFamily,
        textAlign: cs.textAlign,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        marginTop: cs.marginTop,
        marginRight: cs.marginRight,
        marginBottom: cs.marginBottom,
        marginLeft: cs.marginLeft,
        display: cs.display,
        position: cs.position,
        visibility: cs.visibility,
        opacity: cs.opacity,
        borderBottom: cs.borderBottom,
        borderTop: cs.borderTop,
        gap: cs.gap,
        flexDirection: cs.flexDirection,
        justifyContent: cs.justifyContent,
        alignItems: cs.alignItems,
        maxWidth: cs.maxWidth,
        minWidth: cs.minWidth,
        maxHeight: cs.maxHeight,
        minHeight: cs.minHeight,
      },
      textContent: getDirectText(el),
      isVisible: visible,
    };

    const alt = el.getAttribute("alt");
    if (alt && alt.trim()) entry.alt = alt.trim().substring(0, 120);
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) entry.ariaLabel = ariaLabel.trim().substring(0, 120);
    const rawSrc = el.getAttribute("src");
    if (rawSrc && !rawSrc.startsWith("data:")) {
      const base = rawSrc.split(/[?#]/)[0].split("/").pop();
      if (base) entry.src = base.substring(0, 80);
    }
    const placeholder = el.getAttribute("placeholder");
    if (placeholder && placeholder.trim()) {
      entry.placeholder = placeholder.trim().substring(0, 120);
    }

    results.push(entry);
  }

  return results;
}

/**
 * Extract a DOM snapshot from a Playwright page.
 * Call this after the page is fully loaded and scrolled (same state as screenshot).
 */
export async function extractDomSnapshot(
  page: Page,
  url: string,
  breakpoint: number
): Promise<DomSnapshot> {
  // Scroll back to top first (autoScroll already does this, but just in case)
  await page.evaluate(() => window.scrollTo(0, 0));

  const elements = await page.evaluate(
    extractElementsInPage,
    Array.from(SIGNIFICANT_TAGS)
  );

  return {
    url,
    breakpoint,
    capturedAt: new Date().toISOString(),
    elements,
  };
}
