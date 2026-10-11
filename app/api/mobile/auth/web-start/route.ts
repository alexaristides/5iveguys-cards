import { NextRequest, NextResponse } from "next/server";
import {
  createMobileSession,
  isAllowedAppRedirect,
  REDIRECT_COOKIE,
  sessionCookieName,
  verifyLinkTicket,
} from "@/lib/mobile-auth";

// Step 1 of the app's Google sign-in, opened in the iOS auth sheet.
//   ?redirect=<app url>  where web-finish sends the token (fiveguys://auth)
//   ?ticket=<jwt>        optional: act as this signed-in app user, so NextAuth
//                        links Google to them instead of signing in fresh
export async function GET(req: NextRequest) {
  const redirect = req.nextUrl.searchParams.get("redirect") ?? "";
  if (!isAllowedAppRedirect(redirect)) {
    return NextResponse.json({ error: "Invalid redirect" }, { status: 400 });
  }

  const res = NextResponse.redirect(new URL("/mobile-auth", req.url));
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
