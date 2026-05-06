import type { SiteTest, TestStep, TestComposition } from "./types";

/**
 * Returns the canonical ordered step list for a test. Prefers
 * `siteTest.steps` when present (new shape, written by the test settings
 * overlay); otherwise derives a flat list from the legacy `pages` +
 * `compositions` shape so older tests render without a write-side
 * migration.
 *
 * Legacy mapping:
 *   - Each pages[] entry → `{ type: "url", url: page.path }`
 *   - Each compositions[i].steps[j] → `{ type: "microtest", microTestId,
 *     captureScreenshot }`
 *   - Compositions with their own startPath get a synthetic url step
 *     prepended so the navigation target is preserved.
 *
 * `flows[]` (recorded action sequences) are intentionally not materialized
 * into the unified list — they're a separate UX surface superseded by
 * micro-tests.
 */
export function getTestSteps(test: SiteTest): TestStep[] {
  if (test.steps && test.steps.length > 0) {
    return test.steps;
  }
  return deriveTestSteps(test);
}

/**
 * Derive a unified step list from the legacy pages + compositions shape.
 * Exposed separately from `getTestSteps` so a one-time persistence
 * migration can call it without the short-circuit on `test.steps`.
 */
export function deriveTestSteps(test: SiteTest): TestStep[] {
  const out: TestStep[] = [];

  for (const page of test.pages || []) {
    out.push({
      id: page.id,
      type: "url",
      url: page.path,
      captureScreenshot: true,
    });
  }

  for (const comp of test.compositions || []) {
    if (comp.startPath && comp.startPath !== "/") {
      out.push({
        id: `${comp.id}-start`,
        type: "url",
        url: comp.startPath,
        captureScreenshot: false,
      });
    }
    for (const step of comp.steps || []) {
      out.push({
        id: step.id,
        type: "microtest",
        microTestId: step.microTestId,
        captureScreenshot: step.captureScreenshot,
      });
    }
  }

  return out;
}

/**
 * Inverse of `deriveTestSteps` — split a unified list back into a
 * synthetic `pages[]` + a single composition. Used by the runner so
 * it can keep using the legacy execution path while the new shape is
 * the source of truth in the UI. Steps preserve order.
 */
export function splitStepsForRunner(
  steps: TestStep[],
): {
  pages: { id: string; path: string }[];
  composition: TestComposition | null;
} {
  const pages: { id: string; path: string }[] = [];
  const microSteps: TestComposition["steps"] = [];

  for (const s of steps) {
    if (s.type === "url" && s.url) {
      pages.push({ id: s.id, path: s.url });
    } else if (s.type === "microtest" && (s.script || s.microTestId)) {
      // Prefer inline script (post-migration shape). Fall back to
      // microTestId for unmigrated tests — the runner's findMicroTest
      // still resolves it from project.microTests in that case.
      microSteps.push({
        id: s.id,
        script: s.script,
        name: s.name,
        microTestId: s.microTestId,
        captureScreenshot: s.captureScreenshot !== false,
      });
    }
  }

  const composition: TestComposition | null =
    microSteps.length > 0
      ? {
          id: "__unified",
          name: "Steps",
          startPath: "/",
          steps: microSteps,
        }
      : null;

  return { pages, composition };
}
