import { auth } from "@/auth";

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
    throw new Error("Not authenticated");
  }
  return session.user.id;
}
