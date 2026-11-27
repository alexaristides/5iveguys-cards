// Signing a browser in without going through NextAuth's own provider flow (Sign in with Apple
// on the website, email codes): create a real NextAuth database Session row, the same as the
// app gets (lib/mobile-auth.ts), and set NextAuth's session cookie to its token. NextAuth then
// treats the browser as signed in like any other.

import type { NextResponse } from "next/server";
import { createMobileSession, sessionCookieName } from "./mobile-auth";

const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60; // matches createMobileSession and NextAuth's default

export async function signInBrowser(res: NextResponse, userId: string) {
  const token = await createMobileSession(userId);
  res.cookies.set(sessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: sessionCookieName().startsWith("__Secure-"),
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}

/** A same-site path to send someone to after signing in; anything else becomes `fallback`. */
export function safeCallbackPath(raw: unknown, fallback = "/fantasy"): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
