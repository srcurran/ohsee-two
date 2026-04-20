import { ipcMain, BrowserWindow } from "electron";
import { spawn, ChildProcess } from "child_process";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";

type Session = {
  sessionId: string;
  proc: ChildProcess;
  tempFile: string;
  exited: boolean;
  exitCode: number | null;
};

const sessions = new Map<string, Session>();

let resolveMainWindow: (() => BrowserWindow | null) | null = null;

export function registerCodegenHandlers(opts: {
  getMainWindow: () => BrowserWindow | null;
  getAppRoot: () => string;
}): void {
  resolveMainWindow = opts.getMainWindow;

  ipcMain.handle("codegen:start", async (_event, params: { url: string }) => {
    const url = typeof params?.url === "string" ? params.url.trim() : "";
    if (!url) throw new Error("codegen:start requires a url");

    const sessionId = randomUUID();
    const tempFile = path.join(tmpdir(), `ohsee-codegen-${sessionId}.js`);

    const playwrightBin = findPlaywrightBin(opts.getAppRoot());
    if (!playwrightBin) {
      throw new Error("Could not locate Playwright CLI — is `playwright` installed?");
    }

    const proc = spawn(
      playwrightBin,
      ["codegen", url, "--target=javascript", "--output", tempFile],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    const session: Session = { sessionId, proc, tempFile, exited: false, exitCode: null };
    sessions.set(sessionId, session);

    proc.stderr?.on("data", (buf: Buffer) => {
      const msg = buf.toString();
      console.log(`[ohsee codegen ${sessionId}] ${msg.trim()}`);
    });

    proc.on("exit", (code) => {
      session.exited = true;
      session.exitCode = code;
      console.log(`[ohsee codegen ${sessionId}] exited with code ${code}`);
      // Notify renderer — it may choose to auto-call stop() to retrieve the script
      const win = resolveMainWindow?.();
      win?.webContents.send("codegen:exited", { sessionId, exitCode: code });
    });

    proc.on("error", (err) => {
      console.error(`[ohsee codegen ${sessionId}] spawn error:`, err);
      session.exited = true;
      const win = resolveMainWindow?.();
      win?.webContents.send("codegen:error", { sessionId, message: String(err) });
    });

    return { sessionId };
  });

  ipcMain.handle("codegen:stop", async (_event, sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session) return { script: "" };

    if (!session.exited && !session.proc.killed) {
      session.proc.kill("SIGTERM");
      // Give it a moment to flush --output to disk before we read
      await new Promise<void>((resolve) => {
        if (session.exited) return resolve();
        const done = () => resolve();
        session.proc.once("exit", done);
        setTimeout(done, 2000);
      });
    }

    let script = "";
    try {
      script = await fs.readFile(session.tempFile, "utf8");
    } catch {
      script = "";
    }
    await fs.unlink(session.tempFile).catch(() => undefined);
    sessions.delete(sessionId);

    return { script };
  });
}

function findPlaywrightBin(appRoot: string): string | null {
  const candidates = [
    path.join(appRoot, "node_modules", ".bin", "playwright"),
    path.join(process.cwd(), "node_modules", ".bin", "playwright"),
  ];
  for (const candidate of candidates) {
    try {
      require("fs").accessSync(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

export function stopAllCodegenSessions(): void {
  for (const [, session] of sessions.entries()) {
    if (!session.exited && !session.proc.killed) {
      session.proc.kill("SIGTERM");
    }
  }
  sessions.clear();
}
