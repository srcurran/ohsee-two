import { auth } from "@/auth";
import { NextResponse } from "next/server";

/**
 * Get the current user's ID from the session.
 * Throws if not authenticated — API routes should catch and return 401.
 *
 * Electron builds short-circuit NextAuth by setting OHSEE_LOCAL_USER_ID.
 */
export async function requireUserId(): Promise<string> {
  const localUserId = process.env.OHSEE_LOCAL_USER_ID;
  if (localUserId) return localUserId;

  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthError();
  }
  return session.user.id;
}

export class AuthError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "AuthError";
  }
}

/**
 * Standard error handler for API routes. Returns 401 for auth errors,
 * 500 with logging for everything else.
 */
export function handleApiError(err: unknown, context?: string): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error(`API error${context ? ` (${context})` : ""}:`, message);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
