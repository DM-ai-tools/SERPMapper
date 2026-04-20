import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "serp_auth";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublicAsset = /\.[a-zA-Z0-9]+$/.test(pathname);

  // Always allow framework assets and auth endpoints.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/favicon.ico" ||
    isPublicAsset
  ) {
    return NextResponse.next();
  }

  // Leave non-auth APIs open to avoid breaking client calls.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const hasSession = req.cookies.get(AUTH_COOKIE)?.value === "1";

  if (!hasSession && pathname !== "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (hasSession && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
