import { NextRequest, NextResponse } from "next/server";
import {
  createMobileSession,
  exchangeAppleAuthorizationCode,
  resolveMobileUser,
  verifyAppleIdentityToken,
} from "@/lib/mobile-auth";

// iOS app: Sign in with Apple → { token, user }.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { identityToken, authorizationCode, fullName } = body as {
    identityToken?: string;
    authorizationCode?: string;
    fullName?: { givenName?: string | null; familyName?: string | null } | null;
  };
  if (!identityToken) {
    return NextResponse.json({ error: "identityToken required" }, { status: 400 });
  }

  let claims;
  try {
    claims = await verifyAppleIdentityToken(identityToken);
  } catch (err) {
    console.error("Apple identity token rejected", err);
    return NextResponse.json({ error: "Apple sign-in failed" }, { status: 401 });
  }

  const refreshToken = authorizationCode ? await exchangeAppleAuthorizationCode(authorizationCode) : null;
  const name = [fullName?.givenName, fullName?.familyName].filter(Boolean).join(" ") || null;

  const user = await resolveMobileUser({
    provider: "apple",
    providerAccountId: claims.sub,
    email: claims.email ?? null,
    name,
    image: null,
    tokens: { refresh_token: refreshToken },
  });
  const token = await createMobileSession(user.id);
  return NextResponse.json({ token, user });
}
