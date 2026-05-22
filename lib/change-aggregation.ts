/**
 * Change aggregation pipeline.
 *
 * `generateSemanticDiff` produces a raw element×property transcript: a page
 * with 9 restyled cards yields 9 identical "Background color changed" entries,
 * a removed nav yields one entry per descendant, and a site-wide font-size
 * shift is reported on every text element. Historically that averaged ~28
 * changes per page, ~76% of which were noise.
 *
 * This module collapses that transcript into the handful of *logical* changes
 * a developer actually made. Four ordered stages:
 *
 *   1. Suppression       — drop derived/downstream changes (line-height that
 *                          follows font-size, unexplained size changes) and
 *                          structural changes nested under a removed/added
 *                          ancestor.
 *   2. Per-element merge — fold axis pairs on one element into a single
 *                          change (margin-left + margin-right → margin-x).
 *   3. Cross-element     — group identical changes across different elements
 *      aggregation        into one entry carrying every affected instance.
 *   4. Description       — rewrite descriptions to be content-based and to
 *                          surface the aggregate count.
 *
 * Stages 1–3 are pure `SemanticChange[] → SemanticChange[]` and validated
 * against historical reports. Stage 4 additionally consults the DOM snapshots
 * for element text content.
 */

import type { SemanticChange, DomSnapshot, CapturedElement } from "./types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const isRemoval = (c: SemanticChange): boolean =>
  c.category === "structural" && c.details.devValue === "absent";

const isAddition = (c: SemanticChange): boolean =>
  c.category === "structural" && c.details.prodValue === "absent";

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}

/** Selector of the parent element (one segment up), or "" at the root. */
function parentSelector(sel: string): string {
  const i = sel.lastIndexOf(" > ");
  return i === -1 ? "" : sel.slice(0, i);
}

/** Longest shared selector prefix across a set of selectors. */
function commonAncestor(selectors: string[]): string {
  if (selectors.length === 0) return "";
  let prefix = selectors[0].split(" > ");
  for (let s = 1; s < selectors.length; s++) {
    const parts = selectors[s].split(" > ");
    let i = 0;
    while (i < prefix.length && i < parts.length && prefix[i] === parts[i]) i++;
    prefix = prefix.slice(0, i);
    if (prefix.length === 0) break;
  }
  return prefix.join(" > ");
}

const OPAQUE_SEGMENT = /^(?:div(?::nth-of-type\(\d+\))?|#(?:w-node-|wf-|node-|el-|block-)[a-z0-9-]+)$/i;

/** Human-ish location label from a selector — drops opaque div/id segments. */
function readableLocation(sel: string): string {
  if (!sel) return "the page";
  const parts = sel.split(" > ").filter((p) => !OPAQUE_SEGMENT.test(p.trim()));
  if (parts.length === 0) return "the page";
  return parts.slice(-2).join(" > ");
}

// ---------------------------------------------------------------------------
// Stage 1 — suppression
// ---------------------------------------------------------------------------

/**
 * Drop structural add/removes nested under another add/remove. Removing a
 * container implies removing its whole subtree; emitting one entry per
 * descendant is pure noise (historically 76% of all "Element removed"
 * entries). Only the topmost removed/added ancestor survives.
 */
export function suppressNestedStructural(
  changes: SemanticChange[],
): SemanticChange[] {
  const removedSelectors = changes.filter(isRemoval).map((c) => c.selector);
  const addedSelectors = changes.filter(isAddition).map((c) => c.selector);

  const nestedUnder = (sel: string, ancestors: string[]): boolean =>
    ancestors.some((a) => a !== sel && sel.startsWith(a + " > "));

  return changes.filter((c) => {
    if (isRemoval(c)) return !nestedUnder(c.selector, removedSelectors);
    if (isAddition(c)) return !nestedUnder(c.selector, addedSelectors);
    return true;
  });
}

/**
 * Drop changes that are pure downstream effects of another change.
 *
 * This is now just line-height: it is proportionally derived from font-size,
 * so when font-size also changed on the same element the line-height delta
 * carries no independent signal.
 *
 * (Position shifts and rendered size deltas are no longer produced at all —
 * `generateSemanticDiff` only emits intentional min/max box-property edits,
 * so there is nothing downstream to suppress there.)
 */
export function suppressDownstream(
  changes: SemanticChange[],
): SemanticChange[] {
  const propsBySelector = new Map<string, Set<string>>();
  for (const c of changes) {
    let set = propsBySelector.get(c.selector);
    if (!set) {
      set = new Set();
      propsBySelector.set(c.selector, set);
    }
    if (c.details.property) set.add(c.details.property);
  }

  return changes.filter((c) => {
    if (
      c.details.property === "line-height" &&
      propsBySelector.get(c.selector)?.has("font-size")
    ) {
      return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Stage 2 — per-element merge
// ---------------------------------------------------------------------------

interface AxisPair {
  a: string;
  b: string;
  merged: string;
  label: string;
}

/** Opposing-edge property pairs that read as one logical edit when together. */
const AXIS_PAIRS: AxisPair[] = [
  { a: "margin-left", b: "margin-right", merged: "margin-x", label: "Horizontal margin" },
  { a: "margin-top", b: "margin-bottom", merged: "margin-y", label: "Vertical margin" },
  { a: "padding-left", b: "padding-right", merged: "padding-x", label: "Horizontal padding" },
  { a: "padding-top", b: "padding-bottom", merged: "padding-y", label: "Vertical padding" },
];

/**
 * Fold opposing-edge spacing pairs on a single element into one change —
 * `margin-left 0→60px` + `margin-right 0→60px` becomes one "Horizontal
 * margin" entry. Other changes pass through untouched.
 */
export function mergePerElement(changes: SemanticChange[]): SemanticChange[] {
  const bySelector = new Map<string, SemanticChange[]>();
  for (const c of changes) {
    const group = bySelector.get(c.selector) ?? [];
    group.push(c);
    bySelector.set(c.selector, group);
  }

  const out: SemanticChange[] = [];
  for (const group of bySelector.values()) {
    const consumed = new Set<string>();

    for (const pair of AXIS_PAIRS) {
      const ca = group.find(
        (c) => c.details.property === pair.a && !consumed.has(c.id),
      );
      const cb = group.find(
        (c) => c.details.property === pair.b && !consumed.has(c.id),
      );
      if (!ca || !cb) continue;
      consumed.add(ca.id);
      consumed.add(cb.id);

      const sameTransition =
        ca.details.prodValue === cb.details.prodValue &&
        ca.details.devValue === cb.details.devValue;
      out.push({
        ...ca,
        description: sameTransition
          ? `${pair.label} changed from ${ca.details.prodValue} to ${ca.details.devValue}`
          : `${pair.label} changed`,
        details: {
          property: pair.merged,
          prodValue: sameTransition
            ? ca.details.prodValue
            : `${ca.details.prodValue} / ${cb.details.prodValue}`,
          devValue: sameTransition
            ? ca.details.devValue
            : `${ca.details.devValue} / ${cb.details.devValue}`,
        },
      });
    }

    for (const c of group) {
      if (!consumed.has(c.id)) out.push(c);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stage 3 — cross-element aggregation
// ---------------------------------------------------------------------------

/**
 * Build the representative change for a group of identical changes. The
 * representative `selector` is the lexically-smallest one — deterministic and
 * layout-independent, so the same logical change keys identically across
 * breakpoints. `yPosition` is the topmost instance (for marker placement).
 */
function mergeGroup(group: SemanticChange[]): SemanticChange {
  if (group.length === 1) return group[0];
  const repBySelector = [...group].sort((a, b) =>
    a.selector < b.selector ? -1 : a.selector > b.selector ? 1 : 0,
  )[0];
  const minY = Math.min(...group.map((c) => c.yPosition));
  const instances = [...group]
    .sort((a, b) => a.yPosition - b.yPosition)
    .map((c) => ({ selector: c.selector, yPosition: c.yPosition }));
  return { ...repBySelector, yPosition: minY, instances };
}

/**
 * Collapse changes that are the *same logical edit applied to many elements*
 * into a single entry that carries every affected instance.
 *
 *  • non-structural — grouped by exact value transition
 *    `(category, property, prodValue → devValue)`.
 *  • structural     — grouped by `(direction, tag, parentSelector)`, so N
 *    sibling `<li>` removals from one `<ul>` become one entry, but unrelated
 *    removals stay distinct.
 */
export function aggregateAcrossElements(
  changes: SemanticChange[],
): SemanticChange[] {
  const out: SemanticChange[] = [];

  // --- non-structural: identical value transition ---
  const valueGroups = new Map<string, SemanticChange[]>();
  for (const c of changes) {
    if (c.category === "structural") continue;
    const key = [
      c.category,
      c.details.property ?? "",
      c.details.prodValue ?? "",
      c.details.devValue ?? "",
    ].join(" ");
    const group = valueGroups.get(key) ?? [];
    group.push(c);
    valueGroups.set(key, group);
  }
  for (const group of valueGroups.values()) out.push(mergeGroup(group));

  // --- structural: sibling add/removes of the same tag ---
  const structGroups = new Map<string, SemanticChange[]>();
  for (const c of changes) {
    if (c.category !== "structural") continue;
    const direction = isRemoval(c) ? "rm" : isAddition(c) ? "add" : "restructure";
    const key = [direction, c.tag, parentSelector(c.selector)].join(" ");
    const group = structGroups.get(key) ?? [];
    group.push(c);
    structGroups.set(key, group);
  }
  for (const group of structGroups.values()) out.push(mergeGroup(group));

  return out.sort((a, b) => a.yPosition - b.yPosition);
}

// ---------------------------------------------------------------------------
// Stage 4 — content-based descriptions
// ---------------------------------------------------------------------------

/** Landmark tags whose own role is a meaningful location label on its own.
 *  `section`/`article` are deliberately excluded — they are named by their
 *  heading, and "the section" as a bare label says nothing. */
const LANDMARK_TAGS = new Set([
  "header", "nav", "main", "footer", "aside", "form",
]);

/** Region landmarks whose own role names a location better than any heading
 *  found nearby — headings inside page chrome are unreliable locators. */
const CHROME_LANDMARKS = new Set(["header", "nav", "footer", "aside"]);

/** Heading tags, used to name the section a change sits in. */
const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/** Media tags whose identity comes from alt / aria-label / src, not text. */
const MEDIA_TAGS = new Set(["img", "svg", "video", "picture", "iframe"]);

/** Plain-English noun for an HTML tag, so descriptions read in terms of what
 *  an element *is* rather than naming the raw tag. */
const TAG_NOUNS: Record<string, string> = {
  img: "image", picture: "image", svg: "graphic", video: "video", iframe: "embed",
  a: "link", button: "button",
  input: "field", textarea: "field", select: "field",
  p: "paragraph", li: "list item", ul: "list", ol: "list",
  h1: "heading", h2: "heading", h3: "heading", h4: "heading", h5: "heading", h6: "heading",
  nav: "navigation", header: "header", footer: "footer", aside: "sidebar",
  section: "section", article: "section", main: "main content",
  form: "form", table: "table", figure: "figure", blockquote: "quote",
};

function tagNoun(tag: string): string {
  return TAG_NOUNS[tag] ?? "element";
}

function pluralNoun(noun: string): string {
  return noun.endsWith("s") ? noun : `${noun}s`;
}

/**
 * Human-readable location for a change — the page section or region it sits
 * in. Resolved by vertical position: the nearest heading at or above the
 * change names its section; the smallest landmark whose span contains the
 * change names a region. Position is used rather than selector ancestry
 * because builder-generated sites (Webflow et al.) root most elements at
 * scattered ids, so two elements in the same section share no selector
 * prefix. Returns "" when the change sits above the first heading (page
 * chrome) and no semantic landmark contains it — better an honest blank than
 * a confidently wrong section name.
 */
function computeLocation(
  change: SemanticChange,
  elements: CapturedElement[],
): string {
  const y = change.yPosition;
  let headingText = "";
  let headingY = -Infinity;
  let landmarkNoun = "";
  let landmarkChrome = false;
  let landmarkSpan = Infinity;

  for (const e of elements) {
    if (!e.isVisible) continue;
    const top = e.bounds.y;

    if (HEADING_TAGS.has(e.tag)) {
      const text = e.textContent?.trim();
      // closest heading at or above the change's vertical position
      if (text && top <= y + 4 && top > headingY) {
        headingY = top;
        headingText = text;
      }
    } else if (LANDMARK_TAGS.has(e.tag)) {
      // smallest landmark whose vertical span contains the change
      const h = e.bounds.height;
      if (h > 0 && top <= y + 4 && top + h >= y - 4 && h < landmarkSpan) {
        landmarkSpan = h;
        landmarkNoun = tagNoun(e.tag);
        landmarkChrome = CHROME_LANDMARKS.has(e.tag);
      }
    }
  }

  if (landmarkChrome) return `the ${landmarkNoun}`;
  if (headingText) return `the “${truncate(headingText, 40)}” section`;
  if (landmarkNoun) return `the ${landmarkNoun}`;
  return "";
}

/** Distinct text content of descendants of `selector`, plus the total count. */
function descendantTexts(
  elements: CapturedElement[],
  selector: string,
  limit: number,
): { samples: string[]; total: number } {
  const prefix = selector + " > ";
  const seen = new Set<string>();
  const samples: string[] = [];
  for (const e of elements) {
    if (!e.selector.startsWith(prefix)) continue;
    const text = e.textContent?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    if (samples.length < limit) samples.push(text);
  }
  return { samples, total: seen.size };
}

/** Describe a structural change by what the element *is* and contains —
 *  leading with a plain noun (image, link, navigation) rather than its tag. */
function describeStructural(
  change: SemanticChange,
  elements: CapturedElement[],
  verb: string,
): string {
  const noun = tagNoun(change.tag);
  const count = change.instances?.length ?? 1;

  if (count > 1) {
    const first = change.instances![0].selector;
    const el = elements.find((e) => e.selector === first);
    const sample =
      el?.textContent?.trim() ||
      el?.alt ||
      el?.ariaLabel ||
      descendantTexts(elements, first, 1).samples[0] ||
      "";
    const eg = sample ? ` (e.g. “${truncate(sample, 40)}”)` : "";
    return `${verb} ${count} ${pluralNoun(noun)}${eg}`;
  }

  const el = elements.find((e) => e.selector === change.selector);

  // Media: identity is the alt text / accessible name / source filename.
  if (MEDIA_TAGS.has(change.tag)) {
    const name = el?.alt || el?.ariaLabel || el?.src || "";
    return name ? `${verb} ${noun} “${truncate(name, 60)}”` : `${verb} ${noun}`;
  }

  // Text-bearing element: name it by its own text.
  const own = el?.textContent?.trim() || el?.ariaLabel;
  if (own) return `${verb} ${noun} “${truncate(own, 60)}”`;

  // Container: name it by the content it holds.
  const { samples, total } = descendantTexts(elements, change.selector, 3);
  if (samples.length > 0) {
    const quoted = samples.map((s) => `“${truncate(s, 30)}”`).join(", ");
    const more = total > samples.length ? `, +${total - samples.length} more` : "";
    return `${verb} ${noun} containing ${quoted}${more}`;
  }
  return `${verb} ${noun}`;
}

/** rgb()/rgba() → #hex, with a trailing opacity note when not fully opaque. */
function formatColor(value: string | undefined): string {
  if (!value) return "";
  const m = value.match(
    /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/,
  );
  if (!m) return value;
  const hex =
    "#" +
    [m[1], m[2], m[3]]
      .map((n) => Math.round(parseFloat(n)).toString(16).padStart(2, "0"))
      .join("");
  const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
  return alpha < 1 ? `${hex} (${Math.round(alpha * 100)}%)` : hex;
}

/** Colour changes carry their values in `details`; surface them so two
 *  different transitions don't both render as a bare "Text color changed". */
function describeColor(change: SemanticChange): string {
  const label =
    change.details.property === "background-color"
      ? "Background color"
      : "Text color";
  const from = formatColor(change.details.prodValue);
  const to = formatColor(change.details.devValue);
  return from && to
    ? `${label} changed from ${from} to ${to}`
    : change.description;
}

/** Append an aggregate-scope suffix when a change covers multiple elements. */
function appendScope(base: string, change: SemanticChange): string {
  const n = change.instances?.length ?? 1;
  if (n < 2) return base;
  const ancestor = commonAncestor(change.instances!.map((i) => i.selector));
  const sitewide = !ancestor || ancestor.split(" > ").length <= 1;
  const where = sitewide ? "site-wide" : `in ${readableLocation(ancestor)}`;
  return `${base} — ${n} elements ${where}`;
}

/**
 * Rewrite descriptions so they read in terms of content and scope rather than
 * raw CSS selectors. Structural changes are described by the text they
 * contain; aggregated changes gain an "N elements" scope suffix.
 */
export function describeChanges(
  changes: SemanticChange[],
  prod: DomSnapshot,
  dev: DomSnapshot,
): SemanticChange[] {
  return changes.map((change) => {
    let description = change.description;

    if (isRemoval(change)) {
      description = describeStructural(change, prod.elements, "Removed");
    } else if (isAddition(change)) {
      description = describeStructural(change, dev.elements, "Added");
    } else if (change.details.property === "dom-restructure") {
      // The element exists in both snapshots (it moved); describe by whichever
      // side still has its content so the entry isn't a bare opaque selector.
      const prefix = change.selector + " > ";
      const inProd = prod.elements.some(
        (e) => e.selector === change.selector || e.selector.startsWith(prefix),
      );
      description = describeStructural(
        change,
        inProd ? prod.elements : dev.elements,
        "Restructured",
      );
    } else {
      if (change.category === "color") description = describeColor(change);
      else if (change.details.property === "textContent") {
        const from = change.details.prodValue ?? "";
        const to = change.details.devValue ?? "";
        if (from && to) {
          description = `Text changed from “${truncate(from, 45)}” to “${truncate(to, 45)}”`;
        }
      }
      description = appendScope(description, change);
    }

    // Locate the change by content rather than selector. Aggregated changes
    // already carry an "N elements …" scope suffix, so skip a per-change
    // location for them. Removals/restructures resolve against prod (gone
    // from dev); additions and modifications against dev.
    const aggregated = (change.instances?.length ?? 1) > 1;
    const locElements = isAddition(change) ? dev.elements : prod.elements;
    const location = aggregated
      ? undefined
      : computeLocation(change, locElements) || undefined;

    if (description === change.description && location === change.location) {
      return change;
    }
    return { ...change, description, location };
  });
}

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

/**
 * Run stages 2–4 of the aggregation pipeline. Stage 1's nested-structural
 * suppression runs earlier inside `generateSemanticDiff` (before the
 * restructure-consolidation step); `suppressDownstream` runs here.
 */
export function aggregateChanges(
  changes: SemanticChange[],
  prod: DomSnapshot,
  dev: DomSnapshot,
): SemanticChange[] {
  let result = suppressDownstream(changes);
  result = mergePerElement(result);
  result = aggregateAcrossElements(result);
  result = describeChanges(result, prod, dev);
  return result;
}
