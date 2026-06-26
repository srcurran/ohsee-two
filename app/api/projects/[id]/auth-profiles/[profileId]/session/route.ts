import { NextResponse } from "next/server";
import { writeJsonFile } from "@/lib/data";
import { userProjectsFile } from "@/lib/constants";
import { requireUserId, AuthError } from "@/lib/auth-helpers";
import { readProjectsWithMigration } from "@/lib/site-test-migration";
import { captureLoginState } from "@/lib/micro-test-runner";
import { requestManualOtp, cancelOtpRequests } from "@/lib/otp-prompt";
import type { ScriptCredentials } from "@/lib/types";

/**
 * POST /api/projects/[id]/auth-profiles/[profileId]/session
 * Run the profile's login script against prod + dev, capture the resulting
 * storage state, and cache it on the profile (the "generate session" step).
 * Vault credentials are resolved client-side and passed in the body.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; profileId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id, profileId } = await params;
    const body = await request.json().catch(() => ({}));
    const credentials = (body as { scriptCredentials?: ScriptCredentials }).scriptCredentials;
    // A client-owned id the renderer polls to discover this run's OTP prompts.
    const runId = (body as { runId?: string }).runId;

    const projects = await readProjectsWithMigration(userId);
    const project = projects.find((p) => p.id === id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const profile = project.authProfiles?.find((a) => a.id === profileId);
    if (!profile) {
      return NextResponse.json({ error: "Auth profile not found" }, { status: 404 });
    }
    if (!profile.loginScript?.trim()) {
      return NextResponse.json({ error: "Profile has no login script" }, { status: 400 });
    }

    const normProd = project.prodUrl.match(/^https?:\/\//) ? project.prodUrl : `http://${project.prodUrl}`;
    const normDev = project.devUrl.match(/^https?:\/\//) ? project.devUrl : `http://${project.devUrl}`;

    // Run the login against both environments — storage state is domain-scoped.
    let prod, dev;
    if (credentials?.manualOtp) {
      // Each environment's login triggers its *own* one-time code, and the two
      // codes are indistinguishable to the user. So run them sequentially —
      // only one prompt is ever in flight, so the code the user just received
      // unambiguously belongs to the environment currently asking.
      if (!runId) {
        return NextResponse.json(
          { error: "Manual OTP requires a runId to prompt for the code" },
          { status: 400 },
        );
      }
      try {
        prod = await captureLoginState({
          loginScript: profile.loginScript, baseUrl: normProd, credentials,
          otpResolver: () => requestManualOtp({ runId, env: "Prod", label: profile.name }),
        });
        dev = await captureLoginState({
          loginScript: profile.loginScript, baseUrl: normDev, credentials,
          otpResolver: () => requestManualOtp({ runId, env: "Dev", label: profile.name }),
        });
      } finally {
        // Tear down any prompt still parked (e.g. the login failed before
        // reaching $OTP$, or one env errored) so the client stops polling.
        cancelOtpRequests(runId);
      }
    } else {
      [prod, dev] = await Promise.all([
        captureLoginState({ loginScript: profile.loginScript, baseUrl: normProd, credentials }),
        captureLoginState({ loginScript: profile.loginScript, baseUrl: normDev, credentials }),
      ]);
    }

    profile.storageState = { prod, dev };
    profile.tokensUpdatedAt = new Date().toISOString();
    await writeJsonFile(userProjectsFile(userId), projects);

    return NextResponse.json({
      id: profile.id,
      tokensUpdatedAt: profile.tokensUpdatedAt,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Surface the real reason — it's almost always the user's own login
    // script (a syntax error, a failed selector, a timeout), and seeing it
    // beats a generic "Internal server error".
    const message = err instanceof Error ? err.message : String(err);
    console.error("auth-profile session failed:", message);
    return NextResponse.json(
      { error: `Couldn't capture session: ${message}` },
      { status: 500 },
    );
  }
}
