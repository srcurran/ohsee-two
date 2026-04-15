import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";

/**
 * Dev-only login endpoint. Sets a valid NextAuth session cookie directly.
 * GET /api/auth/dev-login — logs in as the dev user and redirects to /.
 * Only works when NODE_ENV === "development" and DEV_LOGIN_USER_ID is set.
 */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const userId = process.env.DEV_LOGIN_USER_ID;
  const email = process.env.DEV_LOGIN_EMAIL || "dev@ohsee.local";
  const secret = process.env.AUTH_SECRET;

  if (!userId || !secret) {
    return NextResponse.json(
      { error: "DEV_LOGIN_USER_ID or AUTH_SECRET not set" },
      { status: 500 }
    );
  }

  // Mint a JWT token matching what NextAuth expects
  const token = await encode({
    token: {
      userId,
      email,
      name: "Dev User",
      sub: userId,
    },
    secret,
    salt: "authjs.session-token",
  });

  const response = NextResponse.redirect(new URL("/", "http://localhost:3000"));
  response.cookies.set("authjs.session-token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 1 day
  });

  return response;
}
