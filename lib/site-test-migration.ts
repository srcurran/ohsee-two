import { v4 as uuidv4 } from "uuid";
import type { Project, SiteTest } from "./types";
import { readJsonFile, writeJsonFile } from "./data";
import { userProjectsFile } from "./constants";
import { extractScriptBody } from "./script-utils";

/**
 * If a project has no `tests[]`, create a default SiteTest from
 * its existing `pages[]` + `flows[]`. Returns true if migration happened.
 */
export function migrateProjectToSiteTests(project: Project): boolean {
  if (project.tests) return false;

  const defaultTest: SiteTest = {
    id: uuidv4(),
    name: "Default",
    pages: [...(project.pages || [])],
    flows: [...(project.flows || [])],
    createdAt: project.createdAt,
    lastRunAt: project.lastDiffAt,
  };

  project.tests = [defaultTest];
  return true;
}

/**
 * Inline microtest scripts onto the steps that reference them, then drop
 * the now-redundant `project.microTests` collection. After this runs, the
 * runner reads `step.script` directly — no second-level lookup. Returns
 * true if anything changed.
 */
export function inlineMicroTests(project: Project): boolean {
  if (!project.microTests || project.microTests.length === 0) {
    return false;
  }
  const lookup = new Map(project.microTests.map((m) => [m.id, m]));
  let changed = false;

  for (const test of project.tests || []) {
    // Inline on unified steps[]
    for (const step of test.steps || []) {
      if (step.type === "microtest" && step.microTestId && !step.script) {
        const mt = lookup.get(step.microTestId);
        if (mt) {
          step.script = mt.script;
          step.name = mt.displayName;
          changed = true;
        }
      }
    }
    // Inline on legacy compositions[].steps too — splitStepsForRunner still
    // round-trips through this shape on its way to the runner.
    for (const comp of test.compositions || []) {
      for (const cstep of comp.steps || []) {
        if (cstep.microTestId && !cstep.script) {
          const mt = lookup.get(cstep.microTestId);
          if (mt) {
            cstep.script = mt.script;
            cstep.name = mt.displayName;
            changed = true;
          }
        }
      }
    }
  }

  // Drop the library entirely — every reference has been inlined.
  delete project.microTests;
  changed = true;

  return changed;
}

/**
 * Classify each test as "simple" or "advanced" if it isn't already tagged.
 * A test is "advanced" when it carries any Playwright content (microtest
 * steps, legacy flows, or compositions); otherwise it's "simple" (URL-only,
 * or empty — empty tests are most likely fresh simple drafts). Mixed tests
 * (both URL and script content) classify as "advanced", matching the
 * one-way simple → advanced rule. Non-destructive: only sets `testType`;
 * the URL-step → script rewrite happens later at convert time.
 * Returns true if anything changed.
 */
export function classifyTestTypes(project: Project): boolean {
  let changed = false;

  for (const test of project.tests || []) {
    if (test.testType) continue;

    let hasScript: boolean;
    if (test.steps && test.steps.length > 0) {
      // Unified steps supersede pages/flows/compositions.
      hasScript = test.steps.some((s) => s.type === "microtest");
    } else {
      hasScript =
        (test.flows?.length ?? 0) > 0 || (test.compositions?.length ?? 0) > 0;
    }

    test.testType = hasScript ? "advanced" : "simple";
    changed = true;
  }

  return changed;
}

/** Escape a string for embedding inside a single-quoted JS literal. */
function jsSingleQuote(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, " ");
}

/**
 * Collapse an advanced test's stepped shape into a single Playwright script
 * (the new advanced model). Each former step's body is concatenated in order;
 * a capturing step gets an `await ohsee.snapshot('label')` appended. Runs only
 * for advanced tests that don't already have a `script`. Idempotent.
 * Returns true if anything changed.
 */
export function migrateAdvancedToScript(project: Project): boolean {
  let changed = false;

  for (const test of project.tests || []) {
    if (test.testType !== "advanced") continue;
    if (test.script && test.script.trim()) continue;

    const steps = test.steps || [];
    if (steps.length === 0) continue;

    const blocks: string[] = [];
    for (const step of steps) {
      const capture = step.captureScreenshot !== false;
      if (step.type === "url" && step.url) {
        blocks.push(`await page.goto('${jsSingleQuote(step.url)}');`);
        if (capture) blocks.push(`await ohsee.snapshot('${jsSingleQuote(step.url)}');`);
      } else if (step.type === "microtest" && step.script) {
        const label = step.name || "step";
        // Strip codegen scaffolding (require/IIFE/browser setup) so the
        // concatenated body runs against the injected `page`.
        const body = extractScriptBody(step.script);
        if (!body) continue;
        blocks.push(`// ${label}`);
        blocks.push(body);
        if (capture) blocks.push(`await ohsee.snapshot('${jsSingleQuote(label)}');`);
      }
    }

    if (blocks.length === 0) continue;

    test.script = blocks.join("\n\n");
    // The script is now the source of truth for advanced tests; clear the
    // stepped shape so editors/runner read only `script`.
    test.steps = [];
    delete test.compositions;
    changed = true;
  }

  return changed;
}

/**
 * Migrate all projects for a user. Reads, migrates in-memory, persists if changed.
 */
export async function migrateAllProjects(userId: string): Promise<void> {
  const filePath = userProjectsFile(userId);
  const projects = await readJsonFile<Project[]>(filePath, []);
  let changed = false;

  for (const project of projects) {
    if (migrateProjectToSiteTests(project)) {
      changed = true;
    }
  }

  if (changed) {
    await writeJsonFile(filePath, projects);
  }
}

/**
 * Read projects with lazy migration: auto-upgrades on first access.
 * Returns the (possibly migrated) project list.
 */
export async function readProjectsWithMigration(userId: string): Promise<Project[]> {
  const filePath = userProjectsFile(userId);
  const projects = await readJsonFile<Project[]>(filePath, []);
  let changed = false;

  for (const project of projects) {
    if (migrateProjectToSiteTests(project)) {
      changed = true;
    }
    if (inlineMicroTests(project)) {
      changed = true;
    }
    if (classifyTestTypes(project)) {
      changed = true;
    }
    if (migrateAdvancedToScript(project)) {
      changed = true;
    }
  }

  if (changed) {
    await writeJsonFile(filePath, projects);
  }

  return projects;
}
