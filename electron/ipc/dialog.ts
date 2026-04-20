import { ipcMain, dialog, shell, BrowserWindow } from "electron";

type FileFilter = { name: string; extensions: string[] };

let resolveMainWindow: (() => BrowserWindow | null) | null = null;

export function registerDialogHandlers(opts: { getMainWindow: () => BrowserWindow | null }): void {
  resolveMainWindow = opts.getMainWindow;

  ipcMain.handle(
    "dialog:saveFile",
    async (_event, params: { defaultName: string; filters?: FileFilter[] }): Promise<string | null> => {
      const win = resolveMainWindow?.();
      const options = { defaultPath: params.defaultName, filters: params.filters };
      const result = await (win
        ? dialog.showSaveDialog(win, options)
        : dialog.showSaveDialog(options));
      return result.canceled ? null : result.filePath ?? null;
    },
  );

  ipcMain.handle(
    "dialog:openFile",
    async (_event, params: { filters?: FileFilter[]; multiple?: boolean }): Promise<string[] | null> => {
      const win = resolveMainWindow?.();
      const options = {
        properties: (params.multiple ? ["openFile", "multiSelections"] : ["openFile"]) as (
          | "openFile"
          | "multiSelections"
        )[],
        filters: params.filters,
      };
      const result = await (win
        ? dialog.showOpenDialog(win, options)
        : dialog.showOpenDialog(options));
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths;
    },
  );

  ipcMain.handle("dialog:revealInFinder", async (_event, targetPath: string) => {
    if (typeof targetPath !== "string" || !targetPath) return;
    shell.showItemInFolder(targetPath);
  });
}
