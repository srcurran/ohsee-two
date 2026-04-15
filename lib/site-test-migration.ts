import { v4 as uuidv4 } from "uuid";
import type { Project, SiteTest } from "./types";
import { readJsonFile, writeJsonFile } from "./data";
import { userProjectsFile } from "./constants";

/**
 * If a project has no `tests[]`, create a default SiteTest from
 * its existing `pages[]` + `flows[]`. Returns true if migration happened.
 */
export function migrateProjectToSiteTests(project: Project): boolean {
  if (project.tests && project.tests.length > 0) return false;

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
  }

  if (changed) {
    await writeJsonFile(filePath, projects);
  }

  return projects;
}
