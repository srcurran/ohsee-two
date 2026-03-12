import { auth } from "./auth";
import { NextResponse } from "next/server";

export const proxy = auth((req) => {
  const { nextUrl } = req;
  const isAuthenticated = !!req.auth;

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
