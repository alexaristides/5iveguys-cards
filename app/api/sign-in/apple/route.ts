import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { APPLE_STATE_COOKIE, APPLE_STATE_PATH, appleAuthorizeUrl, appleSignInOrigin, appleWebConfigured } from "@/lib/apple-web";
import { safeCallbackPath } from "@/lib/web-session";

// Website: start Sign in with Apple (see lib/apple-web.ts).
export async function GET(req: NextRequest) {
  const callbackUrl = safeCallbackPath(req.nextUrl.searchParams.get("callbackUrl"));
  if (!appleWebConfigured()) {
    return NextResponse.redirect(new URL(`/sign-in?error=apple&callbackUrl=${encodeURIComponent(callbackUrl)}`, req.nextUrl.origin));
  }

  // The state cookie has to be set on the origin Apple returns to.
  const origin = appleSignInOrigin(req.nextUrl.origin);
  if (origin !== req.nextUrl.origin) {
    return NextResponse.redirect(`${origin}${req.nextUrl.pathname}${req.nextUrl.search}`);
  }

  const state = randomBytes(16).toString("hex");
  const nonce = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(appleAuthorizeUrl(origin, state, nonce));
  res.cookies.set(APPLE_STATE_COOKIE, JSON.stringify({ state, nonce, callbackUrl }), {
    httpOnly: true,
    secure: true,
    sameSite: "none", // Apple form-posts back from appleid.apple.com
    path: APPLE_STATE_PATH,
    maxAge: 10 * 60,
  });
  return res;
}
