import { app, BrowserWindow, shell } from "electron";
import { spawn, ChildProcess } from "child_process";
import { createServer } from "net";
import path from "path";
import { registerNotifyHandlers, stopAllTracking } from "./ipc/notify";
import { registerCodegenHandlers, stopAllCodegenSessions } from "./ipc/codegen";
import { registerVaultHandlers } from "./ipc/vault";
import { registerDialogHandlers } from "./ipc/dialog";

const IS_DEV = !app.isPackaged;

// In dev, we expect `next dev` to be running on this port (concurrently via npm script).
// In prod, the main process spawns `.next/standalone/server.js` on a random free port.
const DEV_PORT = 4000;

let nextServerProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let appUrl = "";
let isQuitting = false;

function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close();
        reject(new Error("Failed to pick a free port"));
      }
    });
    server.on("error", reject);
  });
}

async function waitForPort(port: number, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = require("http").request(
        { host: "127.0.0.1", port, path: "/", method: "HEAD", timeout: 500 },
        (res: { statusCode?: number }) => {
          resolve((res.statusCode ?? 500) < 500);
        },
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for Next server on port ${port}`);
}

async function startNextServer(): Promise<number> {
  if (IS_DEV) {
    // Dev mode: Next is expected to already be running on DEV_PORT (via `npm run dev`).
    // We just wait for it to be ready.
    await waitForPort(DEV_PORT);
    return DEV_PORT;
  }

  // Prod mode: spawn the standalone server on a random port.
  const port = await pickFreePort();
  const dataDir = path.join(app.getPath("userData"), "ohsee");
  const browsersDir = path.join(dataDir, "browsers");

  // The Next standalone bundle is copied outside asar via electron-builder's
  // extraResources so the child Node process (running as vanilla node via
  // ELECTRON_RUN_AS_NODE) can read its files directly.
  const standaloneDir = path.join(process.resourcesPath, "app.standalone");
  const standaloneServer = path.join(standaloneDir, "server.js");

  nextServerProcess = spawn(process.execPath, [standaloneServer], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      OHSEE_DATA_DIR: dataDir,
      PLAYWRIGHT_BROWSERS_PATH: browsersDir,
      OHSEE_LOCAL_USER_ID: "local",
      NEXT_PUBLIC_OHSEE_ELECTRON: "true",
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: "inherit",
  });

  nextServerProcess.on("exit", (code) => {
    console.log(`[ohsee] Next standalone server exited with code ${code}`);
    if (!isQuitting) app.quit();
  });

  await waitForPort(port);
  return port;
}

async function createMainWindow(): Promise<void> {
  const port = await startNextServer();
  appUrl = `http://127.0.0.1:${port}`;

  registerNotifyHandlers({
    getAppUrl: () => appUrl,
    getMainWindow: () => mainWindow,
  });

  registerCodegenHandlers({
    getMainWindow: () => mainWindow,
    getAppRoot: () => app.getAppPath(),
  });

  registerVaultHandlers();

  registerDialogHandlers({
    getMainWindow: () => mainWindow,
  });

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  await mainWindow.loadURL(appUrl);

  if (IS_DEV) mainWindow.webContents.openDevTools({ mode: "detach" });

  // Block all external navigation — only allow the Next server URL.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(appUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Open external links in the system browser instead of a new Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(appUrl)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createMainWindow).catch((err) => {
  console.error("[ohsee] Failed to start:", err);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on("before-quit", () => {
  isQuitting = true;
  stopAllTracking();
  stopAllCodegenSessions();
  if (nextServerProcess && !nextServerProcess.killed) {
    nextServerProcess.kill("SIGTERM");
  }
});
