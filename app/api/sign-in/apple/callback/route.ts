import { NextRequest, NextResponse } from "next/server";
import { APPLE_STATE_COOKIE, APPLE_STATE_PATH, nameFromAppleUser, verifyAppleWebIdToken } from "@/lib/apple-web";
import { resolveMobileUser } from "@/lib/mobile-auth";
import { safeCallbackPath, signInBrowser } from "@/lib/web-session";

// Website: Apple form-posts here after Sign in with Apple (see lib/apple-web.ts).
export async function POST(req: NextRequest) {
  let saved: { state?: string; nonce?: string; callbackUrl?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get(APPLE_STATE_COOKIE)?.value ?? "{}");
  } catch {}
  const callbackUrl = safeCallbackPath(saved.callbackUrl);
  const signInPage = (error?: string) =>
    `/sign-in?${new URLSearchParams({ callbackUrl, ...(error ? { error } : {}) })}`;

  const go = (path: string) => {
    const res = NextResponse.redirect(new URL(path, req.nextUrl.origin), 303);
    res.cookies.set(APPLE_STATE_COOKIE, "", { path: APPLE_STATE_PATH, maxAge: 0, secure: true, sameSite: "none" });
    return res;
  };

  const form = await req.formData().catch(() => null);
  if (!form) return go(signInPage("apple"));
  if (form.get("error")) return go(signInPage()); // cancelled
  const idToken = form.get("id_token");
  if (!saved.state || !saved.nonce || form.get("state") !== saved.state || typeof idToken !== "string") {
    return go(signInPage("apple"));
  }

  let claims;
  try {
    claims = await verifyAppleWebIdToken(idToken, saved.nonce);
  } catch (err) {
    console.error("Apple web ID token rejected", err);
    return go(signInPage("apple"));
  }

  const user = await resolveMobileUser({
    provider: "apple",
    providerAccountId: claims.sub,
    email: claims.email ?? null,
    name: nameFromAppleUser(form.get("user")),
    image: null,
    tokens: {},
  });
  return signInBrowser(go(callbackUrl), user.id);
}
