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
  set: (key: string, payload: { label: string; secret: string; totpSeed?: string }) =>
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

const ohsee = {
  notify,
  codegen,
  vault,
  dialog,
  // meta, updater — land in later phases
} as const;

contextBridge.exposeInMainWorld("ohsee", ohsee);
