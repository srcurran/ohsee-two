/**
 * Type definitions for the `window.ohsee` IPC surface exposed by the Electron preload.
 * Shared between renderer (uses via `getOhsee()`) and preload (implements in Electron build).
 *
 * Keep this in sync with `docs/electron-ipc-contract.md`.
 */

export type OhseeNative = {
  meta: OhseeMeta;
  notify: OhseeNotify;
  codegen: OhseeCodegen;
  vault: OhseeVault;
  updater: OhseeUpdater;
  dialog: OhseeDialog;
};

export type OhseeMeta = {
  getVersion(): Promise<{ app: string; electron: string; chromium: string; node: string }>;
  getDataDir(): Promise<string>;
  openDataDir(): Promise<void>;
};

export type OhseeNotify = {
  /**
   * Register a report to be watched by the main process. Main polls the Next API
   * every 2s and fires a native notification when the report reaches a terminal state.
   * Click focuses the window and navigates to /reports/<id>.
   */
  trackReport(reportId: string, projectName: string): Promise<void>;
  stopTracking(reportId: string): Promise<void>;
  /** Dock badge showing number of running audits. */
  setRunningCount(count: number): Promise<void>;
};

export type OhseeCodegen = {
  /**
   * Spawn Playwright's codegen CLI pointed at `url`. Opens the inspector + a
   * Chromium window. Returns a sessionId immediately. The recording is
   * written to a temp file as the user interacts.
   */
  start(params: { url: string }): Promise<{ sessionId: string }>;
  /**
   * Terminate the session (if still running), read the captured script,
   * clean up the temp file. Returns the script as a single Playwright JS
   * blob — suitable to drop into the existing micro-test import pipeline.
   */
  stop(sessionId: string): Promise<{ script: string }>;
  /**
   * Fires when the codegen process exits on its own (user closed the inspector).
   * The renderer should call `stop(sessionId)` to retrieve the script.
   */
  onExited(callback: (payload: { sessionId: string; exitCode: number | null }) => void): () => void;
  onError(callback: (payload: { sessionId: string; message: string }) => void): () => void;
};

export type VaultEntryMeta = {
  key: string;
  label: string;
  createdAt: string;
  hasTotp: boolean;
};

export type VaultEntry = VaultEntryMeta & {
  secret: string;
  totpSeed?: string;
};

export type OhseeVault = {
  list(): Promise<VaultEntryMeta[]>;
  get(key: string): Promise<VaultEntry>;
  set(key: string, value: { label: string; secret: string; totpSeed?: string }): Promise<void>;
  delete(key: string): Promise<void>;
  totp(key: string): Promise<string>;
};

export type OhseeUpdater = {
  check(): Promise<{ available: boolean; version?: string; notes?: string }>;
  downloadAndRestart(): Promise<void>;
  onProgress(callback: (progress: { percent: number; bytesPerSecond: number }) => void): () => void;
};

export type OhseeDialog = {
  saveFile(params: { defaultName: string; filters?: { name: string; extensions: string[] }[] }): Promise<string | null>;
  openFile(params: { filters?: { name: string; extensions: string[] }[]; multiple?: boolean }): Promise<string[] | null>;
  revealInFinder(path: string): Promise<void>;
};
