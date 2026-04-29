import { v4 as uuidv4 } from "uuid";
import type { Project, SiteTest } from "./types";
import { readJsonFile, writeJsonFile } from "./data";
import { userProjectsFile } from "./constants";

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
  }

  if (changed) {
    await writeJsonFile(filePath, projects);
  }

  return projects;
}
