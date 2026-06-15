import { app } from "electron";
import fs from "fs";
import path from "path";

/**
 * App-level config, stored OUTSIDE the data dir (in Electron's userData) so it
 * survives — and stays put — when the user relocates their projects folder.
 */
export type OhseeConfig = {
  /** User-chosen projects/data folder. Absent ⇒ use {@link defaultDataDir}. */
  dataDir?: string;
};

function configPath(): string {
  return path.join(app.getPath("userData"), "ohsee-config.json");
}

/** Default projects/data folder when the user hasn't chosen one. */
export function defaultDataDir(): string {
  return path.join(app.getPath("userData"), "ohsee");
}

export function readConfig(): OhseeConfig {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as OhseeConfig) : {};
  } catch {
    // Missing or malformed config — fall back to defaults.
    return {};
  }
}

export function writeConfig(config: OhseeConfig): void {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), "utf8");
}

/** The effective projects/data folder: the user's override, else the default. */
export function getDataDir(): string {
  const configured = readConfig().dataDir;
  return configured && configured.trim() ? configured : defaultDataDir();
}

/** Persist a new projects/data folder. Takes effect on next launch. */
export function setDataDir(dir: string): void {
  writeConfig({ ...readConfig(), dataDir: dir });
}
