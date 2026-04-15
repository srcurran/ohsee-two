import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth-helpers";
import { readProjectsWithMigration } from "@/lib/site-test-migration";
import { executeMicroTest } from "@/lib/micro-test-runner";
import { mintSessionCookie } from "@/lib/auth-token";
import { chromium } from "playwright";

type Params = { id: string; microTestId: string };

/**
 * POST /api/projects/[id]/micro-tests/[microTestId]/test
 * Run a micro-test against the project's dev URL and return pass/fail with output.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<Params> },
) {
  try {
    const userId = await requireUserId();
    const { id, microTestId } = await params;

    const projects = await readProjectsWithMigration(userId);
    const project = projects.find((p) => p.id === id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const microTest = project.microTests?.find((mt) => mt.id === microTestId);
    if (!microTest) {
      return NextResponse.json({ error: "Micro-test not found" }, { status: 404 });
    }

    // Prepare auth if the project requires it
    const authConfig = project.requiresAuth
      ? await mintSessionCookie({ userId, targetUrl: project.devUrl })
      : undefined;

    const browser = await chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu"],
    });

    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1,
        ...(authConfig
          ? {
              storageState: {
                cookies: [
                  {
                    name: authConfig.cookieName,
                    value: authConfig.cookieValue,
                    domain: authConfig.domain,
                    path: "/",
                    httpOnly: true,
                    sameSite: "Lax" as const,
                    secure: authConfig.cookieName.startsWith("__Secure-"),
                    expires: Math.floor(Date.now() / 1000) + 3600,
                  },
                ],
                origins: [],
              },
            }
          : {}),
      });

      const page = await context.newPage();

      // Collect console messages for diagnostic output
      const consoleLogs: string[] = [];
      page.on("console", (msg) => {
        consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
      });

      // Navigate to dev URL root before running the script
      const devUrl = project.devUrl.replace(/\/$/, "");
      await page.goto(devUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await Promise.race([
        page.waitForLoadState("networkidle"),
        page.waitForTimeout(5000),
      ]);

      const startTime = Date.now();

      try {
        await executeMicroTest(page, microTest.script);
        const durationMs = Date.now() - startTime;

        return NextResponse.json({
          pass: true,
          durationMs,
          consoleLogs: consoleLogs.slice(-50),
        });
      } catch (err) {
        const durationMs = Date.now() - startTime;
        const error = err instanceof Error ? err.message : String(err);

        return NextResponse.json({
          pass: false,
          error,
          durationMs,
          consoleLogs: consoleLogs.slice(-50),
        });
      } finally {
        await context.close();
      }
    } finally {
      await browser.close();
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
