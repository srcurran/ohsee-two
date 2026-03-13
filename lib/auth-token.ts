import { encode } from "next-auth/jwt";

const AUTH_SECRET = process.env.AUTH_SECRET!;

export interface AuthCookieConfig {
  cookieName: string;
  cookieValue: string;
  domain: string;
}

/**
 * Mint a valid NextAuth session cookie for Playwright injection.
 * Requires AUTH_SECRET in the environment.
 */
export async function mintSessionCookie(options: {
  userId: string;
  targetUrl: string;
}): Promise<AuthCookieConfig> {
  const { userId, targetUrl } = options;
  const url = new URL(targetUrl);

  // NextAuth v5 uses different cookie names for HTTP vs HTTPS
  const useSecure = url.protocol === "https:";
  const cookieName = useSecure
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  const token = await encode({
    token: {
      sub: userId,
      userId,
      name: "OHSEE Screenshot Bot",
      email: "bot@ohsee.local",
      iat: Math.floor(Date.now() / 1000),
    },
    secret: AUTH_SECRET,
    salt: cookieName,
    maxAge: 60 * 60, // 1 hour
  });

  return {
    cookieName,
    cookieValue: token,
    domain: url.hostname,
  };
}
