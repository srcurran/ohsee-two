import path from "path";
import type { TestVariant } from "./types";

export const BREAKPOINTS = [1920, 1440, 1024, 768, 440, 375] as const;

/**
 * Built-in test variants. Projects can select from these in the create form.
 * initScript runs before each page load via Playwright's addInitScript.
 */
export const BUILT_IN_VARIANTS: TestVariant[] = [
  {
    id: "light",
    label: "Light",
    colorScheme: "light",
    initScript: 'localStorage.setItem("theme","light");document.documentElement.classList.remove("dark");',
  },
  {
    id: "dark",
    label: "Dark",
    colorScheme: "dark",
    initScript: 'localStorage.setItem("theme","dark");document.documentElement.classList.add("dark");',
  },
];

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
