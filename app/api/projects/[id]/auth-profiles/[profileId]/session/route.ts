import { NextResponse } from "next/server";
import { writeJsonFile } from "@/lib/data";
import { userProjectsFile } from "@/lib/constants";
import { requireUserId, handleApiError } from "@/lib/auth-helpers";
import { readProjectsWithMigration } from "@/lib/site-test-migration";
import { captureLoginState } from "@/lib/micro-test-runner";
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
    const [prod, dev] = await Promise.all([
      captureLoginState({ loginScript: profile.loginScript, baseUrl: normProd, credentials }),
      captureLoginState({ loginScript: profile.loginScript, baseUrl: normDev, credentials }),
    ]);

    profile.storageState = { prod, dev };
    profile.tokensUpdatedAt = new Date().toISOString();
    await writeJsonFile(userProjectsFile(userId), projects);

    return NextResponse.json({
      id: profile.id,
      tokensUpdatedAt: profile.tokensUpdatedAt,
    });
  } catch (err) {
    return handleApiError(err, "auth-profile session");
  }
}
