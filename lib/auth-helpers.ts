import { auth } from "@/auth";

/**
 * Get the current user's ID from the session.
 * Throws if not authenticated — API routes should catch and return 401.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Not authenticated");
  }
  return session.user.id;
}
