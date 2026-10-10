import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  AccountConflictError,
  createMobileSession,
  exchangeGoogleServerAuthCode,
  resolveMobileUser,
} from "@/lib/mobile-auth";

// iOS app: Google Sign-In (with the YouTube scope) → { token, user }.
// Called with an existing Bearer session it links Google to that user instead
// ("Connect YouTube" for Sign in with Apple users).
export async function POST(req: NextRequest) {
  const { serverAuthCode } = await req.json().catch(() => ({}));
  if (typeof serverAuthCode !== "string" || !serverAuthCode) {
    return NextResponse.json({ error: "serverAuthCode required" }, { status: 400 });
  }

  let exchanged;
  try {
    exchanged = await exchangeGoogleServerAuthCode(serverAuthCode);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Google sign-in failed" }, { status: 401 });
  }
  const { tokens, claims } = exchanged;

  const session = await getServerSession(authOptions);
  try {
    const user = await resolveMobileUser({
      provider: "google",
      providerAccountId: claims.sub,
      email: claims.email_verified === false ? null : claims.email ?? null,
      name: claims.name ?? null,
      image: claims.picture ?? null,
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
        scope: tokens.scope,
        id_token: tokens.id_token,
      },
      linkToUserId: session?.user?.id ?? null,
    });
    const token = session?.user?.id ? null : await createMobileSession(user.id);
    return NextResponse.json({ token, user });
  } catch (err) {
    if (err instanceof AccountConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
