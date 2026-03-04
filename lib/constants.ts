import path from "path";

export const BREAKPOINTS = [1920, 1440, 1024, 768, 440, 375] as const;

export type Breakpoint = (typeof BREAKPOINTS)[number];

export const DATA_DIR = path.join(process.cwd(), "data");
export const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
export const REPORTS_DIR = path.join(DATA_DIR, "reports");
