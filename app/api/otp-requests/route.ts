import { NextResponse } from "next/server";
import { requireUserId, handleApiError } from "@/lib/auth-helpers";
import { listPendingOtp } from "@/lib/otp-prompt";

/**
 * GET /api/otp-requests?runId=...
 * Poll the manual-OTP prompts a "generate session" run is currently blocked on.
 * The client shows a code-entry dialog for each and posts the code back to
 * /api/otp-requests/[id].
 */
export async function GET(request: Request) {
  try {
    await requireUserId();
    const runId = new URL(request.url).searchParams.get("runId") ?? undefined;
    return NextResponse.json({ pending: listPendingOtp(runId) });
  } catch (err) {
    return handleApiError(err, "list otp-requests");
  }
}
