import path from "path";

export const BREAKPOINTS = [1920, 1440, 1024, 768, 440, 375] as const;

export type Breakpoint = (typeof BREAKPOINTS)[number];

export const DATA_DIR = path.join(process.cwd(), "data");

// Legacy paths (used by migration only)
export const LEGACY_PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
export const LEGACY_REPORTS_DIR = path.join(DATA_DIR, "reports");

// Per-user path helpers
export function userDir(userId: string): string {
  return path.join(DATA_DIR, "users", userId);
}

export function userProjectsFile(userId: string): string {
  return path.join(userDir(userId), "projects.json");
}

export function userReportsDir(userId: string): string {
  return path.join(userDir(userId), "reports");
}
