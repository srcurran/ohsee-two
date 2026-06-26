import { NextResponse } from "next/server";
import { requireUserId, handleApiError } from "@/lib/auth-helpers";
import { submitManualOtp } from "@/lib/otp-prompt";

/**
 * POST /api/otp-requests/[id]  { code: string }
 * Hand the user-typed code to the login that's blocked waiting on it, resuming
 * the paused Playwright run.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUserId();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const code = typeof (body as { code?: unknown }).code === "string" ? (body as { code: string }).code.trim() : "";
    if (!code) {
      return NextResponse.json({ error: "A code is required" }, { status: 400 });
    }
    const accepted = submitManualOtp(id, code);
    if (!accepted) {
      // The request already resolved, timed out, or was cancelled.
      return NextResponse.json({ error: "This code prompt is no longer waiting" }, { status: 410 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "submit otp-request");
  }
}
