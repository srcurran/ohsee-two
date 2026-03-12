import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR, LEGACY_PROJECTS_FILE, LEGACY_REPORTS_DIR, userDir } from "./constants";

/**
 * Migrate legacy global data to a user's directory.
 * Called on first sign-in — moves data/projects.json and data/reports/
 * into data/users/{userId}/.
 *
 * This is idempotent: if the legacy files don't exist, it's a no-op.
 */
export async function migrateGlobalDataToUser(userId: string): Promise<void> {
  // Check if legacy projects.json exists
  try {
    await fs.access(LEGACY_PROJECTS_FILE);
  } catch {
    // No legacy data to migrate
    return;
  }

  const dest = userDir(userId);
  await fs.mkdir(dest, { recursive: true });

  // Move projects.json
  const destProjects = path.join(dest, "projects.json");
  try {
    await fs.access(destProjects);
    // Already exists — don't overwrite
  } catch {
    await fs.rename(LEGACY_PROJECTS_FILE, destProjects);
  }

  // Move reports directory
  const destReports = path.join(dest, "reports");
  try {
    await fs.access(destReports);
    // Already exists — don't overwrite
  } catch {
    try {
      await fs.access(LEGACY_REPORTS_DIR);
      await fs.rename(LEGACY_REPORTS_DIR, destReports);
    } catch {
      // No reports dir to migrate
    }
  }
}
