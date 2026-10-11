import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  createMobileSession,
  deleteMobileSession,
  isAllowedAppRedirect,
  REDIRECT_COOKIE,
  sessionCookieName,
} from "@/lib/mobile-auth";

// Last step of the app's Google sign-in: NextAuth has signed the auth sheet in
// (and linked Google if a ticket was used). Mint the app its own session and
// hand it back via the app's redirect URL; the auth sheet closes on that redirect.
export async function GET(req: NextRequest) {
  const redirect = req.cookies.get(REDIRECT_COOKIE)?.value ?? "";
  if (!isAllowedAppRedirect(redirect)) {
    return NextResponse.json({ error: "Sign-in expired, please try again" }, { status: 400 });
  }

  const target = new URL(redirect);
  // Set by /auth/error when NextAuth failed (e.g. OAuthAccountNotLinked).
  const error = req.nextUrl.searchParams.get("error");
  const session = error ? null : await getServerSession(authOptions);
  if (session?.user?.id) {
    target.searchParams.set("token", await createMobileSession(session.user.id));
  } else {
    target.searchParams.set("error", error && /^\w+$/.test(error) ? error : "signin_failed");
  }

  // The auth sheet's own browser session is single-use.
  const browserToken = req.cookies.get(sessionCookieName())?.value;
  if (browserToken) await deleteMobileSession(browserToken);

  const res = NextResponse.redirect(target);
  res.cookies.delete(REDIRECT_COOKIE);
  res.cookies.delete(sessionCookieName());
  return res;
}
