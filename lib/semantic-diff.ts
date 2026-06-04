import type {
  CapturedElement,
  DomSnapshot,
  SemanticChange,
  ChangeCategory,
} from "./types";
import { suppressNestedStructural, aggregateChanges } from "./change-aggregation";

export interface SemanticDiffResult {
  changes: SemanticChange[];
  summary: Record<string, number>;
  issueCount: number;
}

// --- Thresholds ---
const COLOR_DISTANCE_THRESHOLD = 3.0; // deltaE just-noticeable difference

// --- Main entry point ---

export function generateSemanticDiff(
  prod: DomSnapshot,
  dev: DomSnapshot
): SemanticDiffResult {
  const changes: SemanticChange[] = [];
  let nextId = 1;

  // 1. Match prod ↔ dev elements, then compare each pair. Matching is
  //    content-anchored (see matchElements): a sibling being inserted or
  //    removed shifts every following :nth-of-type index, so a purely
  //    selector-keyed match would compare elements against the wrong
  //    counterpart and report a cascade of bogus "text changed" entries.
  const { pairs, prodOnly, devOnly } = matchElements(prod, dev);
  for (const { prod: prodEl, dev: devEl } of pairs) {
    for (const c of compareElements(prodEl, devEl)) {
      changes.push({ ...c, id: `sc-${nextId++}` });
    }
  }

  // 3. Pair up moved elements (same tag + similar content found in both lists)
  const pairedProd = new Set<string>();
  const pairedDev = new Set<string>();

  for (const pEl of prodOnly) {
    if (pairedProd.has(pEl.selector)) continue;
    // Find best match in devOnly
    let bestMatch: CapturedElement | null = null;
    let bestScore = 0;
    for (const dEl of devOnly) {
      if (pairedDev.has(dEl.selector)) continue;
      if (dEl.tag !== pEl.tag) continue;
      let score = 0;
      if (pEl.textContent && dEl.textContent) {
        if (pEl.textContent === dEl.textContent) score += 4;
        else if (pEl.textContent.includes(dEl.textContent) || dEl.textContent.includes(pEl.textContent)) score += 2;
      }
      // Similar bounds size
      const wDiff = Math.abs(pEl.bounds.width - dEl.bounds.width);
      const hDiff = Math.abs(pEl.bounds.height - dEl.bounds.height);
      if (wDiff < 20 && hDiff < 20) score += 2;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = dEl;
      }
    }
    if (bestMatch && bestScore >= 3) {
      pairedProd.add(pEl.selector);
      pairedDev.add(bestMatch.selector);
      // This is a "moved" element — emit as a layout change, not structural
      changes.push({
        id: `sc-${nextId++}`,
        category: "layout",
        severity: "warning",
        description: `<${pEl.tag}> moved in DOM${pEl.textContent ? `: "${truncate(pEl.textContent, 30)}"` : ""}`,
        selector: pEl.selector,
        tag: pEl.tag,
        yPosition: pEl.bounds.y,
        details: {
          property: "dom-position",
          prodValue: pEl.selector,
          devValue: bestMatch.selector,
        },
      });
    }
  }

  // Remaining unpaired = truly added/removed
  for (const prodEl of prodOnly) {
    if (pairedProd.has(prodEl.selector)) continue;
    changes.push({
      id: `sc-${nextId++}`,
      category: "structural",
      severity: "error",
      description: `Element removed: <${prodEl.tag}>${prodEl.textContent ? ` "${truncate(prodEl.textContent, 40)}"` : ""}`,
      selector: prodEl.selector,
      tag: prodEl.tag,
      yPosition: prodEl.bounds.y,
      details: { property: "element", prodValue: "present", devValue: "absent" },
    });
  }

  for (const devEl of devOnly) {
    if (pairedDev.has(devEl.selector)) continue;
    changes.push({
      id: `sc-${nextId++}`,
      category: "structural",
      severity: "error",
      description: `New element: <${devEl.tag}>${devEl.textContent ? ` "${truncate(devEl.textContent, 40)}"` : ""}`,
      selector: devEl.selector,
      tag: devEl.tag,
      yPosition: devEl.bounds.y,
      details: { property: "element", prodValue: "absent", devValue: "present" },
    });
  }

  // Removing or adding a container implies its whole subtree changed too.
  // Collapse structural changes nested under another structural change so
  // only the topmost add/remove survives — historically ~76% of "Element
  // removed" entries were descendants of an already-reported removal.
  const prunedChanges = suppressNestedStructural(changes);

  // 4. Pair remaining structural add/remove by tag to consolidate
  //    e.g., "removed <iframe>" + "new <iframe>" → "restructured <iframe>"
  const structRemoved = prunedChanges.filter(
    (c) => c.category === "structural" && c.details.devValue === "absent"
  );
  const structAdded = prunedChanges.filter(
    (c) => c.category === "structural" && c.details.prodValue === "absent"
  );
  const pairedStructIds = new Set<string>();
  for (const rem of structRemoved) {
    const match = structAdded.find(
      (a) => a.tag === rem.tag && !pairedStructIds.has(a.id)
    );
    if (match) {
      pairedStructIds.add(rem.id);
      pairedStructIds.add(match.id);
    }
  }
  // Replace paired structural changes with a single "restructured" entry per pair
  const consolidatedChanges: SemanticChange[] = [];
  const seenPairTags = new Set<string>();
  for (const c of prunedChanges) {
    if (pairedStructIds.has(c.id)) {
      // Only emit once per tag
      const pairKey = `struct-${c.tag}`;
      if (!seenPairTags.has(pairKey)) {
        seenPairTags.add(pairKey);
        consolidatedChanges.push({
          ...c,
          severity: "warning",
          description: `<${c.tag}> restructured in DOM`,
          details: { property: "dom-restructure", prodValue: "moved", devValue: "moved" },
        });
      }
    } else {
      consolidatedChanges.push(c);
    }
  }

  // Deduplicate cascading layout changes (parent/child shift suppression).
  const deduped = deduplicateChanges(consolidatedChanges);

  // Collapse the raw element×property transcript into logical changes:
  // suppress downstream effects, merge axis pairs, aggregate identical
  // changes across repeated elements, and rewrite descriptions.
  const aggregated = aggregateChanges(deduped, prod, dev);

  // Build summary
  const summary: Record<string, number> = {};
  for (const c of aggregated) {
    summary[c.category] = (summary[c.category] || 0) + 1;
  }

  return {
    changes: aggregated,
    summary,
    issueCount: aggregated.length,
  };
}

// --- Element matching ---

interface ElementMatch {
  pairs: { prod: CapturedElement; dev: CapturedElement }[];
  prodOnly: CapturedElement[];
  devOnly: CapturedElement[];
}

/**
 * Content identity of an element for matching: its collapsed direct text,
 * or — for text-less controls and media — the next best stable signal
 * (accessible name, input placeholder, image alt or source filename). This
 * lets an <input> or <img> anchor to its real counterpart instead of being
 * reported as removed+added when a structural edit shifts its selector.
 */
function contentIdentity(el: CapturedElement): string {
  const text = el.textContent.trim().replace(/\s+/g, " ");
  if (text) return text;
  return (
    el.ariaLabel?.trim() ||
    el.placeholder?.trim() ||
    el.alt?.trim() ||
    el.src?.trim() ||
    ""
  );
}

/**
 * Content identity of every element's descendants, keyed by the ancestor's
 * selector, in document order and capped so identity keys stay bounded.
 * Lets a text-less container be identified by what it holds — including
 * form controls and media, which contribute their placeholder/alt.
 */
function buildDescendantText(
  elements: CapturedElement[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const el of elements) {
    const text = contentIdentity(el);
    if (!text) continue;
    const segs = el.selector.split(" > ");
    for (let i = 1; i < segs.length; i++) {
      const ancestor = segs.slice(0, i).join(" > ");
      const arr = map.get(ancestor);
      if (arr) {
        if (arr.length < 25) arr.push(text);
      } else {
        map.set(ancestor, [text]);
      }
    }
  }
  return map;
}

/**
 * Identity key for content-anchoring. An element with content identity keys
 * on it (own text, or a control's placeholder / media's alt); a text-less
 * container keys on its descendants' identity — so a wrapper that survives a
 * sibling deletion still matches by what it holds rather than its shifted
 * :nth-of-type selector. Returns null when there is no identity anywhere in
 * the element's subtree.
 */
function anchorKey(
  el: CapturedElement,
  descendants: Map<string, string[]>,
): string | null {
  const own = contentIdentity(el);
  if (own) return `t:${el.tag}:${JSON.stringify(own)}`;
  const desc = descendants.get(el.selector);
  if (desc && desc.length > 0) return `d:${el.tag}:${JSON.stringify(desc)}`;
  return null;
}

/** Overlap of two sets, 0–1 (intersection / union). */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Fuzzy container matching (Pass 3): a leftover text-less container is paired
// with the opposite side's container of the same tag whose descendant content
// overlaps it most, when that overlap clears FUZZY_OVERLAP and beats the
// runner-up by FUZZY_MARGIN (so the winner is unambiguous).
const FUZZY_OVERLAP = 0.6;
const FUZZY_MARGIN = 0.15;

/**
 * Match prod ↔ dev elements.
 *
 * Pass 1 — content anchor: an element is identified by content, not by its
 * CSS selector — a text-bearing element by its own text, a text-less
 * container by the text of its descendants (so a wrapper row matches by
 * what it holds). When that identity is unambiguous — the same key appears
 * *exactly once* on each side — the two elements are the same logical
 * element even if a sibling insertion/removal shifted its :nth-of-type
 * selector. Repeated content (N:M, e.g. an "About" link in both the nav and
 * the footer) is deliberately left unanchored: pairing it by document order
 * guesses wrong when the counts differ and invents phantom changes.
 *
 * Pass 2 — selector-match the remainder: elements with no text anywhere in
 * their subtree, repeated-content elements, and genuine text edits (old
 * text gone, new text new). Anything still unmatched falls to the caller's
 * similarity pairing.
 *
 * Anchoring first is what stops a deleted sibling from cascading into a
 * pile of bogus "text changed" entries: every surviving row matches its
 * real counterpart by content, so the wrong-counterpart comparison that a
 * purely selector-keyed match would make can never happen.
 */
function matchElements(prod: DomSnapshot, dev: DomSnapshot): ElementMatch {
  const pairs: { prod: CapturedElement; dev: CapturedElement }[] = [];
  const claimedProd = new Set<CapturedElement>();
  const claimedDev = new Set<CapturedElement>();

  // Pass 1 — content anchor.
  const prodDescendants = buildDescendantText(prod.elements);
  const devDescendants = buildDescendantText(dev.elements);
  const prodByKey = new Map<string, CapturedElement[]>();
  const devByKey = new Map<string, CapturedElement[]>();
  const group = (
    map: Map<string, CapturedElement[]>,
    el: CapturedElement,
    descendants: Map<string, string[]>,
  ) => {
    const k = anchorKey(el, descendants);
    if (!k) return;
    const arr = map.get(k);
    if (arr) arr.push(el);
    else map.set(k, [el]);
  };
  for (const el of prod.elements) group(prodByKey, el, prodDescendants);
  for (const el of dev.elements) group(devByKey, el, devDescendants);

  for (const [key, prodEls] of prodByKey) {
    const devEls = devByKey.get(key);
    // Only anchor an unambiguous 1:1 identity. Ambiguous repeated text is
    // left for the selector pass / similarity pairing — order-pairing it
    // here produced phantom removed/added elements when counts differed.
    if (devEls && prodEls.length === 1 && devEls.length === 1) {
      pairs.push({ prod: prodEls[0], dev: devEls[0] });
      claimedProd.add(prodEls[0]);
      claimedDev.add(devEls[0]);
    }
  }

  // Pass 2 — selector-match whatever is left, but only when the selector
  // unambiguously identifies one element on each side and the tags agree.
  // Builder-generated sites (Webflow et al.) routinely ship duplicate ids,
  // so a single selector can resolve to several elements; pairing those by
  // document order guesses wrong and invents a phantom pair — a cascade of
  // bogus style diffs — plus a stray add/remove. A tag mismatch likewise
  // means the id was reused on a different element, not edited in place.
  // Ambiguous or cross-tag selectors fall through to similarity pairing.
  const groupBySelector = (
    elements: CapturedElement[],
    claimed: Set<CapturedElement>,
  ): Map<string, CapturedElement[]> => {
    const map = new Map<string, CapturedElement[]>();
    for (const el of elements) {
      if (claimed.has(el)) continue;
      const arr = map.get(el.selector);
      if (arr) arr.push(el);
      else map.set(el.selector, [el]);
    }
    return map;
  };
  const prodBySelector = groupBySelector(prod.elements, claimedProd);
  const devBySelector = groupBySelector(dev.elements, claimedDev);
  for (const [selector, prodEls] of prodBySelector) {
    const devEls = devBySelector.get(selector);
    if (
      devEls &&
      prodEls.length === 1 &&
      devEls.length === 1 &&
      prodEls[0].tag === devEls[0].tag
    ) {
      pairs.push({ prod: prodEls[0], dev: devEls[0] });
      claimedProd.add(prodEls[0]);
      claimedDev.add(devEls[0]);
    }
  }

  // Pass 3 — fuzzy container anchor. A text-less wrapper is keyed by the exact
  // ordered list of its descendants' content (anchorKey's `d:` form), so a
  // single reordered/added/removed/volatile child gives it a different key on
  // each side; it then fails Passes 1–2 and would be reported as a phantom
  // "Added"/"Removed" element even though it exists in both. Pair the leftover
  // containers by descendant-content *overlap* instead, so a small subtree
  // change no longer reads as a structural add. Same-tag, visible, and only
  // when the best overlap is an unambiguous winner.
  const buildContainerSets = (
    elements: CapturedElement[],
    descendants: Map<string, string[]>,
    claimed: Set<CapturedElement>,
  ): Map<CapturedElement, Set<string>> => {
    const sets = new Map<CapturedElement, Set<string>>();
    for (const el of elements) {
      if (claimed.has(el) || !el.isVisible) continue;
      if (contentIdentity(el)) continue; // text-bearing → not a container
      const desc = descendants.get(el.selector);
      if (desc && desc.length > 0) sets.set(el, new Set(desc));
    }
    return sets;
  };
  const prodSets = buildContainerSets(prod.elements, prodDescendants, claimedProd);
  const devSets = buildContainerSets(dev.elements, devDescendants, claimedDev);
  for (const [pEl, pSet] of prodSets) {
    let best: CapturedElement | null = null;
    let bestOverlap = 0;
    let runnerUp = 0;
    for (const [dEl, dSet] of devSets) {
      if (claimedDev.has(dEl) || dEl.tag !== pEl.tag) continue;
      const overlap = jaccard(pSet, dSet);
      if (overlap > bestOverlap) {
        runnerUp = bestOverlap;
        bestOverlap = overlap;
        best = dEl;
      } else if (overlap > runnerUp) {
        runnerUp = overlap;
      }
    }
    if (best && bestOverlap >= FUZZY_OVERLAP && bestOverlap - runnerUp >= FUZZY_MARGIN) {
      pairs.push({ prod: pEl, dev: best });
      claimedProd.add(pEl);
      claimedDev.add(best);
    }
  }

  // Whatever stays unclaimed is genuinely added/removed (or moved — the
  // caller's similarity pairing resolves that). Invisible-only elements are
  // dropped so they aren't reported as removed/added.
  return {
    pairs,
    prodOnly: prod.elements.filter((el) => !claimedProd.has(el) && el.isVisible),
    devOnly: dev.elements.filter((el) => !claimedDev.has(el) && el.isVisible),
  };
}

// --- Alignment anchors (drives the image diff's DOM-anchored bands) ---

export interface AlignmentAnchor {
  prodY: number;
  devY: number;
}

/**
 * Vertical alignment anchors for the image diff: the top-Y of every
 * confidently-matched, visible element on each side, reduced to a strictly
 * increasing monotonic backbone. The Longest-Increasing-Subsequence by devY
 * drops reordered/moved elements — those are real changes and must NOT anchor
 * the alignment. The image diff interpolates between these anchors so the same
 * content is compared even when it sits at a different Y on each side (a header
 * added above it no longer makes everything below read as changed).
 */
export function computeAlignmentAnchors(
  prod: DomSnapshot,
  dev: DomSnapshot,
): AlignmentAnchor[] {
  const { pairs } = matchElements(prod, dev);
  const raw: AlignmentAnchor[] = [];
  for (const { prod: p, dev: d } of pairs) {
    if (!p.isVisible || !d.isVisible) continue;
    const prodY = Math.round(p.bounds.y);
    const devY = Math.round(d.bounds.y);
    if (prodY < 0 || devY < 0) continue;
    raw.push({ prodY, devY });
  }
  raw.sort((a, b) => a.prodY - b.prodY || a.devY - b.devY);
  // Collapse to strictly increasing prodY (one anchor per prod row).
  const byProd: AlignmentAnchor[] = [];
  for (const a of raw) {
    const last = byProd[byProd.length - 1];
    if (last && a.prodY <= last.prodY) continue;
    byProd.push(a);
  }
  return longestIncreasingByDevY(byProd);
}

/** Longest strictly-increasing-by-devY subsequence. O(n^2); n = matched
 *  element count, so fine. Keeps the alignment backbone monotonic. */
function longestIncreasingByDevY(anchors: AlignmentAnchor[]): AlignmentAnchor[] {
  const n = anchors.length;
  if (n === 0) return [];
  const len = new Array<number>(n).fill(1);
  const prev = new Array<number>(n).fill(-1);
  let bestEnd = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (anchors[j].devY < anchors[i].devY && len[j] + 1 > len[i]) {
        len[i] = len[j] + 1;
        prev[i] = j;
      }
    }
    if (len[i] > len[bestEnd]) bestEnd = i;
  }
  const out: AlignmentAnchor[] = [];
  for (let i = bestEnd; i !== -1; i = prev[i]) out.push(anchors[i]);
  return out.reverse();
}

// --- Element comparison ---

function compareElements(
  prod: CapturedElement,
  dev: CapturedElement
): Omit<SemanticChange, "id">[] {
  const changes: Omit<SemanticChange, "id">[] = [];
  const base = { selector: prod.selector, tag: prod.tag, yPosition: prod.bounds.y };

  // Skip if both invisible
  if (!prod.isVisible && !dev.isVisible) return changes;

  // Visibility change
  if (prod.isVisible !== dev.isVisible) {
    changes.push({
      ...base,
      category: "visibility",
      severity: "error",
      description: prod.isVisible
        ? `Element hidden on dev: <${prod.tag}>${prod.textContent ? ` "${truncate(prod.textContent, 40)}"` : ""}`
        : `Element now visible on dev: <${prod.tag}>`,
      details: {
        property: "visibility",
        prodValue: prod.isVisible ? "visible" : "hidden",
        devValue: dev.isVisible ? "visible" : "hidden",
      },
    });
    return changes; // Don't compare other props if visibility changed
  }

  // Text content
  if (prod.textContent && dev.textContent && prod.textContent !== dev.textContent) {
    changes.push({
      ...base,
      category: "content",
      severity: "error",
      description: `Text changed in <${prod.tag}>: "${truncate(prod.textContent, 30)}" → "${truncate(dev.textContent, 30)}"`,
      details: {
        property: "textContent",
        prodValue: truncate(prod.textContent, 80),
        devValue: truncate(dev.textContent, 80),
      },
    });
  }

  // Text alignment
  if (prod.styles.textAlign !== dev.styles.textAlign) {
    changes.push({
      ...base,
      category: "alignment",
      severity: "warning",
      description: `Text alignment changed from ${prod.styles.textAlign} to ${dev.styles.textAlign}`,
      details: {
        property: "text-align",
        prodValue: prod.styles.textAlign,
        devValue: dev.styles.textAlign,
      },
    });
  }

  // Typography
  checkStyleChange(prod, dev, "fontSize", "font-size", "typography", changes, base);
  checkStyleChange(prod, dev, "fontWeight", "font-weight", "typography", changes, base);
  checkStyleChange(prod, dev, "lineHeight", "line-height", "typography", changes, base);
  checkStyleChange(prod, dev, "letterSpacing", "letter-spacing", "typography", changes, base);

  // Font family (simplify comparison - just check first font)
  if (normalizeFontFamily(prod.styles.fontFamily) !== normalizeFontFamily(dev.styles.fontFamily)) {
    changes.push({
      ...base,
      category: "typography",
      severity: "warning",
      description: `Font family changed`,
      details: {
        property: "font-family",
        prodValue: truncate(prod.styles.fontFamily, 60),
        devValue: truncate(dev.styles.fontFamily, 60),
      },
    });
  }

  // Colors
  if (colorDistance(prod.styles.color, dev.styles.color) > COLOR_DISTANCE_THRESHOLD) {
    changes.push({
      ...base,
      category: "color",
      severity: "info",
      description: `Text color changed`,
      details: {
        property: "color",
        prodValue: prod.styles.color,
        devValue: dev.styles.color,
      },
    });
  }

  if (
    colorDistance(prod.styles.backgroundColor, dev.styles.backgroundColor) >
    COLOR_DISTANCE_THRESHOLD
  ) {
    changes.push({
      ...base,
      category: "color",
      severity: "info",
      description: `Background color changed`,
      details: {
        property: "background-color",
        prodValue: prod.styles.backgroundColor,
        devValue: dev.styles.backgroundColor,
      },
    });
  }

  // Spacing (padding)
  checkSpacingChange(prod, dev, "paddingTop", "padding-top", changes, base);
  checkSpacingChange(prod, dev, "paddingRight", "padding-right", changes, base);
  checkSpacingChange(prod, dev, "paddingBottom", "padding-bottom", changes, base);
  checkSpacingChange(prod, dev, "paddingLeft", "padding-left", changes, base);

  // Spacing (margin)
  checkSpacingChange(prod, dev, "marginTop", "margin-top", changes, base);
  checkSpacingChange(prod, dev, "marginRight", "margin-right", changes, base);
  checkSpacingChange(prod, dev, "marginBottom", "margin-bottom", changes, base);
  checkSpacingChange(prod, dev, "marginLeft", "margin-left", changes, base);

  // Gap
  checkSpacingChange(prod, dev, "gap", "gap", changes, base);

  // Flex/grid layout properties
  checkStyleChange(prod, dev, "flexDirection", "flex-direction", "layout", changes, base);
  checkStyleChange(prod, dev, "justifyContent", "justify-content", "alignment", changes, base);
  checkStyleChange(prod, dev, "alignItems", "align-items", "alignment", changes, base);

  // Size constraints — intentional layout edits. Note we compare the CSS
  // min/max box properties, NOT the rendered bounding box: getComputedStyle
  // resolves max-width/min-width to the authored declaration, so a change
  // here is a real edit rather than a downstream reflow (e.g. a button
  // getting narrower because its label shortened).
  checkStyleChange(prod, dev, "maxWidth", "max-width", "layout", changes, base);
  checkStyleChange(prod, dev, "minWidth", "min-width", "layout", changes, base);
  checkStyleChange(prod, dev, "maxHeight", "max-height", "layout", changes, base);
  checkStyleChange(prod, dev, "minHeight", "min-height", "layout", changes, base);

  // Borders (keylines)
  if (prod.styles.borderBottom !== dev.styles.borderBottom) {
    const prodHasBorder = hasMeaningfulBorder(prod.styles.borderBottom);
    const devHasBorder = hasMeaningfulBorder(dev.styles.borderBottom);
    if (prodHasBorder !== devHasBorder) {
      changes.push({
        ...base,
        category: "border",
        severity: "warning",
        description: prodHasBorder
          ? `Bottom border/keyline removed`
          : `Bottom border/keyline added`,
        details: {
          property: "border-bottom",
          prodValue: prod.styles.borderBottom,
          devValue: dev.styles.borderBottom,
        },
      });
    }
  }

  if (prod.styles.borderTop !== dev.styles.borderTop) {
    const prodHasBorder = hasMeaningfulBorder(prod.styles.borderTop);
    const devHasBorder = hasMeaningfulBorder(dev.styles.borderTop);
    if (prodHasBorder !== devHasBorder) {
      changes.push({
        ...base,
        category: "border",
        severity: "warning",
        description: prodHasBorder
          ? `Top border/keyline removed`
          : `Top border/keyline added`,
        details: {
          property: "border-top",
          prodValue: prod.styles.borderTop,
          devValue: dev.styles.borderTop,
        },
      });
    }
  }

  // Position shifts and rendered size changes are deliberately NOT compared
  // from the bounding box — those are downstream reflow effects (an element
  // moves/resizes because something else changed). Intentional size edits
  // are caught above via the min/max box properties; the pixel diff still
  // surfaces any purely visual movement.

  // Display change
  if (prod.styles.display !== dev.styles.display) {
    changes.push({
      ...base,
      category: "layout",
      severity: "warning",
      description: `Display changed from ${prod.styles.display} to ${dev.styles.display}`,
      details: {
        property: "display",
        prodValue: prod.styles.display,
        devValue: dev.styles.display,
      },
    });
  }

  return changes;
}

// --- Helpers ---

function checkStyleChange(
  prod: CapturedElement,
  dev: CapturedElement,
  key: keyof CapturedElement["styles"],
  cssName: string,
  category: ChangeCategory,
  changes: Omit<SemanticChange, "id">[],
  base: { selector: string; tag: string; yPosition: number }
) {
  const pv = prod.styles[key];
  const dv = dev.styles[key];
  if (pv !== dv) {
    changes.push({
      ...base,
      category,
      severity: "warning",
      description: `${cssName} changed from ${pv} to ${dv}`,
      details: { property: cssName, prodValue: pv, devValue: dv },
    });
  }
}

function checkSpacingChange(
  prod: CapturedElement,
  dev: CapturedElement,
  key: keyof CapturedElement["styles"],
  cssName: string,
  changes: Omit<SemanticChange, "id">[],
  base: { selector: string; tag: string; yPosition: number }
) {
  const pv = parsePx(prod.styles[key]);
  const dv = parsePx(dev.styles[key]);
  if (pv !== null && dv !== null && Math.abs(pv - dv) > 1) {
    changes.push({
      ...base,
      category: "spacing",
      severity: Math.abs(pv - dv) > 10 ? "warning" : "info",
      description: `${cssName} changed from ${prod.styles[key]} to ${dev.styles[key]}`,
      details: { property: cssName, prodValue: prod.styles[key], devValue: dev.styles[key] },
    });
  }
}

function parsePx(value: string): number | null {
  const m = value.match(/^([\d.]+)px$/);
  return m ? parseFloat(m[1]) : null;
}

function hasMeaningfulBorder(border: string): boolean {
  if (!border) return false;
  if (border.includes("none")) return false;
  if (border.includes("0px")) return false;
  // Check if there's actually a visible border
  const widthMatch = border.match(/([\d.]+)px/);
  if (widthMatch && parseFloat(widthMatch[1]) > 0) return true;
  return false;
}

function normalizeFontFamily(ff: string): string {
  // Extract the first font from the family list
  return ff.split(",")[0].trim().replace(/['"]/g, "").toLowerCase();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.substring(0, max) + "...";
}

// --- Color distance (simple sRGB euclidean, approximates perceptual) ---

function parseColor(color: string): [number, number, number] | null {
  // Handle rgb(r, g, b) and rgba(r, g, b, a)
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (m) return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
  return null;
}

function colorDistance(c1: string, c2: string): number {
  if (c1 === c2) return 0;
  const p1 = parseColor(c1);
  const p2 = parseColor(c2);
  if (!p1 || !p2) return c1 !== c2 ? COLOR_DISTANCE_THRESHOLD + 1 : 0;

  // Weighted euclidean distance in sRGB (rough perceptual approximation)
  const dr = (p1[0] - p2[0]) * 0.3;
  const dg = (p1[1] - p2[1]) * 0.59;
  const db = (p1[2] - p2[2]) * 0.11;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// --- Deduplication ---

/** Parse "(x, y)" coordinate string and return delta from another */
function parseCoordDelta(
  prodStr?: string,
  devStr?: string
): { dx: number; dy: number } | null {
  if (!prodStr || !devStr) return null;
  const pMatch = prodStr.match(/\(([\d.-]+),\s*([\d.-]+)\)/);
  const dMatch = devStr.match(/\(([\d.-]+),\s*([\d.-]+)\)/);
  if (!pMatch || !dMatch) return null;
  return {
    dx: parseFloat(dMatch[1]) - parseFloat(pMatch[1]),
    dy: parseFloat(dMatch[2]) - parseFloat(pMatch[2]),
  };
}

/**
 * Aggressively deduplicates layout changes:
 * 1. If a parent shifted, suppress all children that shifted by a similar amount
 * 2. If a parent resized, suppress children that only shifted (not resized)
 * 3. If spacing changed on an element, suppress its position shift / size change
 * 4. Collapse DOM-moved elements under same parent
 * 5. Collapse remaining sibling shifts into grouped entries
 */
function deduplicateChanges(changes: SemanticChange[]): SemanticChange[] {
  const suppressed = new Set<string>();

  // Sort by selector depth (shortest first = most parent-like)
  const sorted = [...changes].sort(
    (a, b) => selectorDepth(a.selector) - selectorDepth(b.selector)
  );

  // Pass 1: Suppress child position shifts when a parent also shifted
  for (const change of sorted) {
    if (suppressed.has(change.id)) continue;
    if (change.category !== "layout") continue;

    const isPositionShift = change.details.property === "position";
    const isSizeChange = change.details.property === "dimensions";

    if (!isPositionShift && !isSizeChange) continue;

    const parentDelta = isPositionShift
      ? parseCoordDelta(change.details.prodValue, change.details.devValue)
      : null;

    for (const other of sorted) {
      if (other.id === change.id) continue;
      if (suppressed.has(other.id)) continue;
      // Must be a descendant selector
      if (!other.selector.startsWith(change.selector + " >")) continue;

      if (isPositionShift && other.category === "layout" && other.details.property === "position") {
        // Suppress child if it shifted by a similar amount (within 10px)
        const childDelta = parseCoordDelta(other.details.prodValue, other.details.devValue);
        if (parentDelta && childDelta) {
          if (
            Math.abs(parentDelta.dx - childDelta.dx) < 10 &&
            Math.abs(parentDelta.dy - childDelta.dy) < 10
          ) {
            suppressed.add(other.id);
          }
        }
      }

      // If parent resized, suppress child position-only shifts
      // (children naturally move when parent resizes)
      if (isSizeChange && other.category === "layout" && other.details.property === "position") {
        suppressed.add(other.id);
      }
    }
  }

  // Pass 2: Suppress child size changes that match a parent's size change direction
  for (const change of sorted) {
    if (suppressed.has(change.id)) continue;
    if (change.category !== "layout" || change.details.property !== "dimensions") continue;

    for (const other of sorted) {
      if (other.id === change.id) continue;
      if (suppressed.has(other.id)) continue;
      if (!other.selector.startsWith(change.selector + " >")) continue;
      if (other.category === "layout" && other.details.property === "dimensions") {
        suppressed.add(other.id);
      }
    }
  }

  // Pass 3: Within the same element, suppress layout shifts/resizes that
  // are explained by spacing changes (margin/padding). If an element's
  // margins changed, the resulting position shift and size change are
  // redundant — the spacing entries already tell the story.
  const bySelector = new Map<string, SemanticChange[]>();
  for (const c of sorted) {
    if (suppressed.has(c.id)) continue;
    const group = bySelector.get(c.selector) || [];
    group.push(c);
    bySelector.set(c.selector, group);
  }
  for (const group of bySelector.values()) {
    const hasSpacing = group.some((c) => c.category === "spacing");
    if (!hasSpacing) continue;
    for (const c of group) {
      if (c.category === "layout" && (c.details.property === "position" || c.details.property === "dimensions")) {
        suppressed.add(c.id);
      }
    }
  }

  const remaining = sorted.filter((c) => !suppressed.has(c.id));

  // Pass 4: Collapse DOM-moved elements under same parent
  const moved = remaining.filter(
    (c) => c.category === "layout" && c.details.property === "dom-position"
  );
  const notMoved = remaining.filter(
    (c) => !(c.category === "layout" && c.details.property === "dom-position")
  );

  // Group moved elements by common parent selector prefix
  const moveGroups = new Map<string, SemanticChange[]>();
  for (const m of moved) {
    const parentSel = m.selector.split(" > ").slice(0, -1).join(" > ") || "root";
    const group = moveGroups.get(parentSel) || [];
    group.push(m);
    moveGroups.set(parentSel, group);
  }

  const collapsedMoves: SemanticChange[] = [];
  for (const [parentSel, group] of moveGroups) {
    if (group.length >= 3) {
      collapsedMoves.push({
        ...group[0],
        description: `${group.length} elements restructured in ${readableSelector(parentSel)}`,
      });
    } else {
      collapsedMoves.push(...group);
    }
  }

  // Pass 5: Collapse groups of sibling position shifts
  return collapseRepeatedShifts([...notMoved, ...collapsedMoves]);
}

function collapseRepeatedShifts(changes: SemanticChange[]): SemanticChange[] {
  const layoutShifts = changes.filter(
    (c) => c.category === "layout" && c.details.property === "position"
  );
  const rest = changes.filter(
    (c) => !(c.category === "layout" && c.details.property === "position")
  );

  // Group by parent selector (remove last segment)
  const groups = new Map<string, SemanticChange[]>();
  for (const shift of layoutShifts) {
    const parentSel = shift.selector.split(" > ").slice(0, -1).join(" > ") || "root";
    const group = groups.get(parentSel) || [];
    group.push(shift);
    groups.set(parentSel, group);
  }

  const collapsed: SemanticChange[] = [];
  for (const [parentSel, group] of groups) {
    if (group.length >= 3) {
      // Collapse multiple child shifts into one parent-level notice
      collapsed.push({
        ...group[0],
        description: `${group.length} elements shifted in ${readableSelector(parentSel)}`,
      });
    } else {
      collapsed.push(...group);
    }
  }

  return [...rest, ...collapsed].sort((a, b) => a.yPosition - b.yPosition);
}

function selectorDepth(sel: string): number {
  return sel.split(" > ").length;
}

function readableSelector(sel: string): string {
  const parts = sel.split(" > ");
  // Take last 2 meaningful parts
  const meaningful = parts.filter((p) => !p.match(/^div(:nth-of-type\(\d+\))?$/)).slice(-2);
  return meaningful.length > 0 ? meaningful.join(" > ") : parts.slice(-1)[0];
}
