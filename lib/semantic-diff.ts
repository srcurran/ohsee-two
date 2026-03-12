import type {
  CapturedElement,
  DomSnapshot,
  SemanticChange,
  ChangeCategory,
  ChangeSeverity,
} from "./types";

export interface SemanticDiffResult {
  changes: SemanticChange[];
  summary: Record<string, number>;
  issueCount: number;
}

// --- Thresholds ---
const POSITION_THRESHOLD = 8; // px difference to flag a layout shift
const SIZE_THRESHOLD = 8; // px difference to flag a size change
const COLOR_DISTANCE_THRESHOLD = 3.0; // deltaE just-noticeable difference

// --- Main entry point ---

export function generateSemanticDiff(
  prod: DomSnapshot,
  dev: DomSnapshot
): SemanticDiffResult {
  const prodMap = new Map<string, CapturedElement>();
  const devMap = new Map<string, CapturedElement>();

  for (const el of prod.elements) prodMap.set(el.selector, el);
  for (const el of dev.elements) devMap.set(el.selector, el);

  const changes: SemanticChange[] = [];
  let nextId = 1;

  // 1. Compare matched elements
  for (const [selector, prodEl] of prodMap) {
    const devEl = devMap.get(selector);
    if (!devEl) continue;

    const elChanges = compareElements(prodEl, devEl);
    for (const c of elChanges) {
      changes.push({ ...c, id: `sc-${nextId++}` });
    }
  }

  // 2. Find unmatched elements
  const prodOnly: CapturedElement[] = [];
  const devOnly: CapturedElement[] = [];

  for (const [selector, prodEl] of prodMap) {
    if (!devMap.has(selector) && prodEl.isVisible) {
      prodOnly.push(prodEl);
    }
  }
  for (const [selector, devEl] of devMap) {
    if (!prodMap.has(selector) && devEl.isVisible) {
      devOnly.push(devEl);
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

  // 4. Pair remaining structural add/remove by tag to consolidate
  //    e.g., "removed <iframe>" + "new <iframe>" → "restructured <iframe>"
  const structRemoved = changes.filter(
    (c) => c.category === "structural" && c.details.devValue === "absent"
  );
  const structAdded = changes.filter(
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
  for (const c of changes) {
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

  // Deduplicate cascading changes
  const deduped = deduplicateChanges(consolidatedChanges);

  // Build summary
  const summary: Record<string, number> = {};
  for (const c of deduped) {
    summary[c.category] = (summary[c.category] || 0) + 1;
  }

  return {
    changes: deduped,
    summary,
    issueCount: deduped.length,
  };
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

  // Layout: position shift
  const dx = Math.abs(prod.bounds.x - dev.bounds.x);
  const dy = Math.abs(prod.bounds.y - dev.bounds.y);
  if (dx > POSITION_THRESHOLD || dy > POSITION_THRESHOLD) {
    const parts: string[] = [];
    if (dx > POSITION_THRESHOLD) parts.push(`${dx}px horizontally`);
    if (dy > POSITION_THRESHOLD) parts.push(`${dy}px vertically`);
    changes.push({
      ...base,
      category: "layout",
      severity: Math.max(dx, dy) > 20 ? "error" : "warning",
      description: `Element shifted ${parts.join(" and ")}`,
      details: {
        property: "position",
        prodValue: `(${prod.bounds.x}, ${prod.bounds.y})`,
        devValue: `(${dev.bounds.x}, ${dev.bounds.y})`,
      },
    });
  }

  // Layout: size change
  const dw = Math.abs(prod.bounds.width - dev.bounds.width);
  const dh = Math.abs(prod.bounds.height - dev.bounds.height);
  if (dw > SIZE_THRESHOLD || dh > SIZE_THRESHOLD) {
    const parts: string[] = [];
    if (dw > SIZE_THRESHOLD) parts.push(`width ${prod.bounds.width}→${dev.bounds.width}px`);
    if (dh > SIZE_THRESHOLD) parts.push(`height ${prod.bounds.height}→${dev.bounds.height}px`);
    changes.push({
      ...base,
      category: "layout",
      severity: Math.max(dw, dh) > 30 ? "error" : "warning",
      description: `Element size changed: ${parts.join(", ")}`,
      details: {
        property: "dimensions",
        prodValue: `${prod.bounds.width}x${prod.bounds.height}`,
        devValue: `${dev.bounds.width}x${dev.bounds.height}`,
      },
    });
  }

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
 * 3. Collapse remaining sibling shifts into grouped entries
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

  const remaining = sorted.filter((c) => !suppressed.has(c.id));

  // Pass 3: Collapse DOM-moved elements under same parent
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

  // Pass 4: Collapse groups of sibling position shifts
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
