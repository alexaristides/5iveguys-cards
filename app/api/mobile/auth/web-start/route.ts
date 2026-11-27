import { NextRequest, NextResponse } from "next/server";
import {
  createMobileSession,
  GOOGLE_SIGNIN_ORIGIN,
  isAllowedAppRedirect,
  REDIRECT_COOKIE,
  sessionCookieName,
  verifyLinkTicket,
} from "@/lib/mobile-auth";

// Step 1 of the app's Google sign-in, opened in the iOS auth sheet.
//   ?redirect=<app url>  where web-finish sends the token (fiveguys://auth)
//   ?ticket=<jwt>        optional: act as this signed-in app user, so NextAuth
//                        links Google to them instead of signing in fresh
//   ?basic=1             optional: ask Google for name and email only, no YouTube
//                        access (the fantasy-only app, build 10 on)
export async function GET(req: NextRequest) {
  const redirect = req.nextUrl.searchParams.get("redirect") ?? "";
  if (!isAllowedAppRedirect(redirect)) {
    return NextResponse.json({ error: "Invalid redirect" }, { status: 400 });
  }

  // Run the whole flow (cookies included) on the domain Google knows about.
  if (GOOGLE_SIGNIN_ORIGIN && req.nextUrl.host !== new URL(GOOGLE_SIGNIN_ORIGIN).host) {
    return NextResponse.redirect(new URL(req.nextUrl.pathname + req.nextUrl.search, GOOGLE_SIGNIN_ORIGIN));
  }

  const basic = req.nextUrl.searchParams.get("basic") === "1";
  const res = NextResponse.redirect(new URL(basic ? "/mobile-auth?basic=1" : "/mobile-auth", req.url));
  const secure = req.nextUrl.protocol === "https:";
  res.cookies.set(REDIRECT_COOKIE, redirect, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 600 });

  const ticket = req.nextUrl.searchParams.get("ticket");
  if (ticket) {
    const userId = await verifyLinkTicket(ticket);
    if (!userId) return NextResponse.json({ error: "Invalid or expired ticket" }, { status: 400 });
    const sessionToken = await createMobileSession(userId);
    res.cookies.set(sessionCookieName(), sessionToken, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 600 });
  }
  return res;
}
