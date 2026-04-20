import { Notification, app, BrowserWindow, ipcMain } from "electron";
import http from "http";

type TrackedReport = {
  reportId: string;
  projectName: string;
  timer: NodeJS.Timeout;
};

type MinimalReport = {
  status?: string;
  pages?: Array<{ breakpoints?: Record<string, { diffPercent?: number }> }>;
  error?: string;
};

const TERMINAL_STATES = new Set(["completed", "failed", "cancelled"]);
const POLL_INTERVAL_MS = 2000;
const tracked = new Map<string, TrackedReport>();

let resolveAppUrl: (() => string) | null = null;
let resolveMainWindow: (() => BrowserWindow | null) | null = null;

export function registerNotifyHandlers(opts: {
  getAppUrl: () => string;
  getMainWindow: () => BrowserWindow | null;
}): void {
  resolveAppUrl = opts.getAppUrl;
  resolveMainWindow = opts.getMainWindow;

  ipcMain.handle("notify:trackReport", async (_event, reportId: string, projectName: string) => {
    if (typeof reportId !== "string" || !reportId) return;
    startTracking(reportId, projectName || "Audit");
  });

  ipcMain.handle("notify:stopTracking", async (_event, reportId: string) => {
    stopTracking(reportId);
  });

  ipcMain.handle("notify:setRunningCount", async (_event, count: number) => {
    if (process.platform === "darwin" && app.dock) {
      const n = Math.max(0, Math.floor(Number(count) || 0));
      app.dock.setBadge(n > 0 ? String(n) : "");
    }
  });
}

function startTracking(reportId: string, projectName: string): void {
  if (tracked.has(reportId)) return;
  console.log(`[ohsee] tracking report ${reportId} (${projectName})`);
  const timer = setInterval(() => {
    pollOnce(reportId, projectName).catch((err) => {
      console.error(`[ohsee] notify poll error for ${reportId}:`, err);
    });
  }, POLL_INTERVAL_MS);
  tracked.set(reportId, { reportId, projectName, timer });
}

function stopTracking(reportId: string): void {
  const entry = tracked.get(reportId);
  if (entry) {
    clearInterval(entry.timer);
    tracked.delete(reportId);
  }
}

async function pollOnce(reportId: string, projectName: string): Promise<void> {
  const appUrl = resolveAppUrl?.();
  if (!appUrl) return;

  const report = await fetchJson<MinimalReport>(`${appUrl}/api/reports/${reportId}`);
  if (!report || typeof report.status !== "string") return;
  if (!TERMINAL_STATES.has(report.status)) return;

  stopTracking(reportId);

  // Don't notify on user-initiated cancellations
  if (report.status === "cancelled") return;

  fireNotification(reportId, projectName, report);
}

function fireNotification(reportId: string, projectName: string, report: MinimalReport): void {
  if (!Notification.isSupported()) return;

  let title: string;
  let body: string;

  if (report.status === "completed") {
    const changed = countChangedPages(report);
    title = `${projectName}: audit complete`;
    body = changed > 0 ? `${changed} page${changed === 1 ? "" : "s"} changed` : "No changes detected";
  } else {
    title = `${projectName}: audit failed`;
    body = (report.error ?? "Unknown error").toString().split("\n")[0].slice(0, 140);
  }

  console.log(`[ohsee] firing notification: ${title} — ${body}`);
  const notif = new Notification({ title, body });
  notif.on("click", () => {
    const win = resolveMainWindow?.();
    const appUrl = resolveAppUrl?.();
    if (!win || !appUrl) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.loadURL(`${appUrl}/reports/${reportId}`).catch(() => undefined);
  });
  notif.show();
}

function countChangedPages(report: MinimalReport): number {
  const pages = report.pages ?? [];
  return pages.reduce((count, page) => {
    const bps = page.breakpoints ? Object.values(page.breakpoints) : [];
    const hasChange = bps.some((bp) => (bp?.diffPercent ?? 0) > 0);
    return count + (hasChange ? 1 : 0);
  }, 0);
}

function fetchJson<T>(url: string): Promise<T | null> {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 1500 }, (res) => {
      if ((res.statusCode ?? 500) >= 400) {
        res.resume();
        resolve(null);
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body) as T);
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

export function stopAllTracking(): void {
  for (const reportId of tracked.keys()) stopTracking(reportId);
}
