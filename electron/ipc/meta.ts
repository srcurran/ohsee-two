import { app, ipcMain, shell, dialog, BrowserWindow } from "electron";
import { getDataDir, setDataDir } from "../config";

/**
 * `ohsee.meta` — app introspection plus control over where projects/data live.
 * The data dir is read once at startup (see main.ts), so a changed folder only
 * takes effect after `relaunch()`.
 */
export function registerMetaHandlers(opts: { getMainWindow: () => BrowserWindow | null }): void {
  ipcMain.handle("meta:getVersion", async () => ({
    app: app.getVersion(),
    electron: process.versions.electron ?? "",
    chromium: process.versions.chrome ?? "",
    node: process.versions.node ?? "",
  }));

  ipcMain.handle("meta:getDataDir", async (): Promise<string> => getDataDir());

  ipcMain.handle("meta:openDataDir", async (): Promise<void> => {
    await shell.openPath(getDataDir());
  });

  ipcMain.handle("meta:chooseDataDir", async (): Promise<string | null> => {
    const win = opts.getMainWindow();
    const options = {
      title: "Choose projects folder",
      defaultPath: getDataDir(),
      buttonLabel: "Use this folder",
      properties: ["openDirectory", "createDirectory"] as ("openDirectory" | "createDirectory")[],
    };
    const result = await (win
      ? dialog.showOpenDialog(win, options)
      : dialog.showOpenDialog(options));
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });

  ipcMain.handle("meta:setDataDir", async (_event, dir: string): Promise<void> => {
    if (typeof dir !== "string" || !dir.trim()) {
      throw new Error("Invalid projects folder");
    }
    setDataDir(dir.trim());
  });

  ipcMain.handle("meta:relaunch", async (): Promise<void> => {
    app.relaunch();
    // Graceful quit (fires before-quit, which tears down the Next child) then
    // relaunches with the freshly-persisted data dir.
    app.quit();
  });
}
