import { auth } from "./auth";
import { NextResponse } from "next/server";

export const proxy = auth((req) => {
  const { nextUrl } = req;
  // Electron builds short-circuit NextAuth via env var — treat as authenticated.
  const isAuthenticated = !!req.auth || !!process.env.OHSEE_LOCAL_USER_ID;

  // Allow auth API routes and sign-in page
  if (
    nextUrl.pathname.startsWith("/api/auth") ||
    nextUrl.pathname === "/sign-in"
  ) {
    return NextResponse.next();
  }

  // Allow static assets
  if (
    nextUrl.pathname.startsWith("/_next") ||
    nextUrl.pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to sign-in
  if (!isAuthenticated) {
    const signInUrl = new URL("/sign-in", nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  // Exclude ALL of /_next (not just static/image) so middleware stays off
  // the webpack-hmr WebSocket upgrade — Next 16.2 is strict about that and
  // will fail the handshake with ERR_INVALID_HTTP_RESPONSE otherwise.
  matcher: ["/((?!_next|favicon.ico|.*\\.png$).*)"],
};
