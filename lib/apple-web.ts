// Sign in with Apple on the website (the app signs in natively: /api/mobile/auth/apple).
//
// Needs APPLE_SERVICES_ID: a Services ID grouped with the app's App ID (com.fiveguysfc.cards),
// with https://www.5iveg.com/api/sign-in/apple/callback as its return URL. Grouped with the app,
// Apple gives a person the same user id (`sub`) on the website as in the app, so
// resolveMobileUser lands them on the same profile.
//
// Flow: /api/sign-in/apple sets a state cookie and sends the browser to Apple; Apple form-posts
// the result to /api/sign-in/apple/callback (cross-site, hence SameSite=None on the cookie),
// which checks the ID token and signs the browser in (lib/web-session.ts). We don't exchange the
// authorization code: the ID token is enough to know who it is.

import { jwtVerify } from "jose";
import { APPLE_ISSUER, appleJwks, GOOGLE_SIGNIN_ORIGIN } from "./mobile-auth";

export const APPLE_STATE_COOKIE = "apple-sign-in";
export const APPLE_STATE_PATH = "/api/sign-in/apple";

export const appleWebConfigured = () => Boolean(process.env.APPLE_SERVICES_ID);

/** Apple only returns to the URLs registered on the Services ID, so production signs in on www.5iveg.com. */
export const appleSignInOrigin = (requestOrigin: string) => GOOGLE_SIGNIN_ORIGIN ?? requestOrigin;

export function appleAuthorizeUrl(origin: string, state: string, nonce: string) {
  const params = new URLSearchParams({
    client_id: process.env.APPLE_SERVICES_ID!,
    redirect_uri: `${origin}${APPLE_STATE_PATH}/callback`,
    response_type: "code id_token",
    response_mode: "form_post", // required by Apple when asking for name or email
    scope: "name email",
    state,
    nonce,
  });
  return `${APPLE_ISSUER}/auth/authorize?${params}`;
}

export async function verifyAppleWebIdToken(idToken: string, nonce: string) {
  const { payload } = await jwtVerify(idToken, appleJwks, {
    issuer: APPLE_ISSUER,
    audience: process.env.APPLE_SERVICES_ID!,
  });
  if (payload.nonce !== nonce) throw new Error("Apple ID token nonce mismatch");
  return payload as { sub: string; email?: string };
}

/** Apple sends the name only on someone's first sign-in, as JSON in the `user` form field. */
export function nameFromAppleUser(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const { name } = JSON.parse(raw) as { name?: { firstName?: string; lastName?: string } };
    return [name?.firstName, name?.lastName].filter(Boolean).join(" ").trim() || null;
  } catch {
    return null;
  }
}
