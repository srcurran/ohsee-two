import { app, BrowserWindow, shell, utilityProcess, type UtilityProcess } from "electron";
import { createServer } from "net";
import path from "path";
import fs from "fs";
import { randomBytes } from "crypto";
import { registerNotifyHandlers, stopAllTracking } from "./ipc/notify";
import { registerCodegenHandlers, stopAllCodegenSessions } from "./ipc/codegen";
import { registerVaultHandlers } from "./ipc/vault";
import { registerDialogHandlers } from "./ipc/dialog";
import { registerMetaHandlers } from "./ipc/meta";
import { getDataDir, defaultDataDir } from "./config";

const IS_DEV = !app.isPackaged;

// In dev, we expect `next dev` to be running on this port (concurrently via npm script).
// In prod, the main process spawns `.next/standalone/server.js` on a random free port.
const DEV_PORT = 4000;

let nextServerProcess: UtilityProcess | null = null;
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

// next-auth throws "MissingSecret" without AUTH_SECRET, even though Electron
// bypasses real auth via OHSEE_LOCAL_USER_ID. Persist a per-install random
// secret in the data dir so JWT signing is stable across launches.
function getOrCreateAuthSecret(dataDir: string): string {
  const secretPath = path.join(dataDir, ".auth-secret");
  try {
    const existing = fs.readFileSync(secretPath, "utf8").trim();
    if (existing) return existing;
  } catch {
    // not created yet — fall through to generate
  }
  const secret = randomBytes(32).toString("hex");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
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
  // Where projects/reports/screenshots live. User-configurable via Settings →
  // Projects folder (persisted in ohsee-config.json, read here at startup).
  const dataDir = getDataDir();
  // Playwright browsers stay pinned to the default location so relocating the
  // projects folder doesn't orphan (and force a re-download of) the browsers.
  const browsersDir = path.join(defaultDataDir(), "browsers");
  const authSecret = getOrCreateAuthSecret(dataDir);

  // The Next standalone bundle is copied outside asar via electron-builder's
  // extraResources so the child Node process can read its files directly.
  const standaloneDir = path.join(process.resourcesPath, "app.standalone");
  const standaloneServer = path.join(standaloneDir, "server.js");

  // Run the Next server via utilityProcess (Electron's managed Node child),
  // NOT child_process.spawn(process.execPath). Spawning the app's own bundle
  // binary registers a *second* "Ohsee" app instance with macOS, which adds a
  // stray Dock tile (rendered as a generic "exec" icon) and — because its
  // process title is "next-server", not "Ohsee" — survives quit and piles up
  // across launches. utilityProcess runs headless (no Dock icon) and is torn
  // down with the app.
  nextServerProcess = utilityProcess.fork(standaloneServer, [], {
    cwd: standaloneDir,
    serviceName: "ohsee-next-server",
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      OHSEE_DATA_DIR: dataDir,
      PLAYWRIGHT_BROWSERS_PATH: browsersDir,
      OHSEE_LOCAL_USER_ID: "local",
      NEXT_PUBLIC_OHSEE_ELECTRON: "true",
      AUTH_SECRET: authSecret,
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

  registerMetaHandlers({
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

  // Cmd/Ctrl + 0–9 drive the report view's mode shortcuts (breakpoints,
  // variants, and the All-pages / Changes-only filter). They're intercepted
  // here in the main process rather than the renderer for two reasons: Cmd+0
  // otherwise triggers the default "Reset Zoom" menu accelerator (which would
  // swallow the keypress before the page ever saw it), and this keeps every
  // digit working regardless of focus. preventDefault suppresses both the menu
  // shortcut and the page keydown, so the renderer reacts only to the
  // forwarded event — no double-handling.
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (!(input.meta || input.control) || input.alt || input.shift) return;
    if (!/^[0-9]$/.test(input.key)) return;
    event.preventDefault();
    mainWindow?.webContents.send("window:modeShortcut", Number(input.key));
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
  nextServerProcess?.kill();
});
