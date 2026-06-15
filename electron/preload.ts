import { contextBridge, ipcRenderer } from "electron";

/**
 * Exposes the `window.ohsee` surface to the renderer.
 * Must stay in sync with `lib/electron-types.ts` and `docs/electron-ipc-contract.md`.
 * Sandboxed preload — only safe IPC invokers, no direct Node access.
 */
const notify = {
  trackReport: (reportId: string, projectName: string): Promise<void> =>
    ipcRenderer.invoke("notify:trackReport", reportId, projectName),
  stopTracking: (reportId: string): Promise<void> =>
    ipcRenderer.invoke("notify:stopTracking", reportId),
  setRunningCount: (count: number): Promise<void> =>
    ipcRenderer.invoke("notify:setRunningCount", count),
};

const codegen = {
  start: (params: { url: string }): Promise<{ sessionId: string }> =>
    ipcRenderer.invoke("codegen:start", params),
  stop: (sessionId: string): Promise<{ script: string }> =>
    ipcRenderer.invoke("codegen:stop", sessionId),
  onExited: (cb: (payload: { sessionId: string; exitCode: number | null }) => void) => {
    const listener = (_: unknown, payload: { sessionId: string; exitCode: number | null }) => cb(payload);
    ipcRenderer.on("codegen:exited", listener);
    return () => ipcRenderer.off("codegen:exited", listener);
  },
  onError: (cb: (payload: { sessionId: string; message: string }) => void) => {
    const listener = (_: unknown, payload: { sessionId: string; message: string }) => cb(payload);
    ipcRenderer.on("codegen:error", listener);
    return () => ipcRenderer.off("codegen:error", listener);
  },
};

const vault = {
  list: () =>
    ipcRenderer.invoke("vault:list"),
  get: (key: string) =>
    ipcRenderer.invoke("vault:get", key),
  set: (key: string, payload: { label: string; secret: string; totpSeed?: string; staticOtp?: string }) =>
    ipcRenderer.invoke("vault:set", key, payload),
  delete: (key: string) =>
    ipcRenderer.invoke("vault:delete", key),
  totp: (key: string) =>
    ipcRenderer.invoke("vault:totp", key),
};

const dialog = {
  saveFile: (params: { defaultName: string; filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke("dialog:saveFile", params),
  openFile: (params: { filters?: { name: string; extensions: string[] }[]; multiple?: boolean }) =>
    ipcRenderer.invoke("dialog:openFile", params),
  revealInFinder: (path: string) =>
    ipcRenderer.invoke("dialog:revealInFinder", path),
};

const meta = {
  getVersion: (): Promise<{ app: string; electron: string; chromium: string; node: string }> =>
    ipcRenderer.invoke("meta:getVersion"),
  getDataDir: (): Promise<string> => ipcRenderer.invoke("meta:getDataDir"),
  openDataDir: (): Promise<void> => ipcRenderer.invoke("meta:openDataDir"),
  chooseDataDir: (): Promise<string | null> => ipcRenderer.invoke("meta:chooseDataDir"),
  setDataDir: (dir: string): Promise<void> => ipcRenderer.invoke("meta:setDataDir", dir),
  relaunch: (): Promise<void> => ipcRenderer.invoke("meta:relaunch"),
};

const ohsee = {
  meta,
  notify,
  codegen,
  vault,
  dialog,
  // Global Cmd/Ctrl + 0–9 presses, intercepted + forwarded by the main process.
  onModeShortcut: (cb: (digit: number) => void) => {
    const listener = (_: unknown, digit: number) => cb(digit);
    ipcRenderer.on("window:modeShortcut", listener);
    return () => ipcRenderer.off("window:modeShortcut", listener);
  },
  // updater — lands in a later phase
} as const;

contextBridge.exposeInMainWorld("ohsee", ohsee);
