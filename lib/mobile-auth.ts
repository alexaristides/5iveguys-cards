// Sign-in for the iOS app. The app can't use NextAuth's browser redirect flow,
// so it signs in natively (Google / Apple), posts the result here, and gets
// back a token for a real NextAuth database Session row. middleware.ts turns
// `Authorization: Bearer <token>` into the session cookie, so every existing
// route's getServerSession() works unchanged.

import { randomBytes } from "crypto";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, decodeJwt } from "jose";
import { prisma } from "./db";

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // matches NextAuth's default

export interface MobileUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export async function createMobileSession(userId: string): Promise<string> {
  const sessionToken = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: { sessionToken, userId, expires: new Date(Date.now() + SESSION_MAX_AGE_MS) },
  });
  return sessionToken;
}

export async function deleteMobileSession(sessionToken: string) {
  await prisma.session.deleteMany({ where: { sessionToken } });
}

export class AccountConflictError extends Error {}

interface ProviderIdentity {
  provider: "google" | "apple";
  providerAccountId: string;
  email: string | null;
  name: string | null;
  image: string | null;
  /** Token fields written to the Account row. Undefined fields are left unchanged. */
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expires_at?: number | null;
    scope?: string | null;
    id_token?: string | null;
  };
  /** Set when an already signed-in user is connecting this provider (e.g. Apple user → Connect YouTube). */
  linkToUserId?: string | null;
}

/**
 * Find the user for this provider identity, linking or creating as needed:
 * existing Account → its user; else the signed-in user (when linking); else a
 * user with the same email (mirrors allowDangerousEmailAccountLinking); else new.
 */
export async function resolveMobileUser(identity: ProviderIdentity): Promise<MobileUser> {
  const { provider, providerAccountId, tokens, linkToUserId } = identity;
  // Never overwrite a stored refresh token with nothing.
  const tokenData = Object.fromEntries(
    Object.entries(tokens).filter(([k, v]) => v !== undefined && !(k === "refresh_token" && !v)),
  );

  const account = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
  });

  let userId: string;
  if (account) {
    if (linkToUserId && linkToUserId !== account.userId) {
      throw new AccountConflictError(`This ${provider} account is already linked to another profile.`);
    }
    userId = account.userId;
    await prisma.account.update({ where: { id: account.id }, data: tokenData });
  } else {
    if (linkToUserId) {
      userId = linkToUserId;
    } else {
      const byEmail = identity.email
        ? await prisma.user.findUnique({ where: { email: identity.email }, select: { id: true } })
        : null;
      userId =
        byEmail?.id ??
        (
          await prisma.user.create({
            data: { name: identity.name, email: identity.email, image: identity.image },
            select: { id: true },
          })
        ).id;
    }
    await prisma.account.create({
      data: { userId, type: "oauth", provider, providerAccountId, token_type: "Bearer", ...tokenData },
    });
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, email: true, image: true },
  });
  // Fill in profile gaps (Apple only shares the name on first sign-in; Google has the avatar).
  const patch: Partial<MobileUser> = {};
  if (!user.name && identity.name) patch.name = identity.name;
  if (!user.image && identity.image) patch.image = identity.image;
  if (Object.keys(patch).length) {
    return prisma.user.update({
      where: { id: userId },
      data: patch,
      select: { id: true, name: true, email: true, image: true },
    });
  }
  return user;
}

// ── Google ──────────────────────────────────────────────────────────────────

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token: string;
}

/** Exchange the iOS SDK's serverAuthCode for tokens (web client id/secret, like NextAuth). */
export async function exchangeGoogleServerAuthCode(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "authorization_code",
      redirect_uri: "",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google code exchange failed: ${res.status} ${await res.text()}`);
  }
  const tokens = (await res.json()) as GoogleTokenResponse;
  // Received directly from Google over TLS, so no signature check is needed.
  const claims = decodeJwt(tokens.id_token) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  return { tokens, claims };
}

export async function revokeGoogleToken(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  }).catch(() => {});
}

// ── Apple ───────────────────────────────────────────────────────────────────

const APPLE_ISSUER = "https://appleid.apple.com";
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

export async function verifyAppleIdentityToken(identityToken: string) {
  const { payload } = await jwtVerify(identityToken, appleJwks, {
    issuer: APPLE_ISSUER,
    audience: process.env.APPLE_BUNDLE_ID!,
  });
  return payload as { sub: string; email?: string };
}

function appleConfigured() {
  return Boolean(
    process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY && process.env.APPLE_BUNDLE_ID,
  );
}

async function appleClientSecret() {
  const key = await importPKCS8(process.env.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n"), "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: process.env.APPLE_KEY_ID! })
    .setIssuer(process.env.APPLE_TEAM_ID!)
    .setIssuedAt()
    .setExpirationTime("5m")
    .setAudience(APPLE_ISSUER)
    .setSubject(process.env.APPLE_BUNDLE_ID!)
    .sign(key);
}

/**
 * Exchange the authorization code for an Apple refresh token. We only keep it
 * so it can be revoked on account deletion (required by App Review).
 */
export async function exchangeAppleAuthorizationCode(code: string): Promise<string | null> {
  if (!appleConfigured()) return null;
  const res = await fetch(`${APPLE_ISSUER}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.APPLE_BUNDLE_ID!,
      client_secret: await appleClientSecret(),
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    console.error("Apple code exchange failed", res.status, await res.text());
    return null;
  }
  const json = (await res.json()) as { refresh_token?: string };
  return json.refresh_token ?? null;
}

export async function revokeAppleToken(refreshToken: string) {
  if (!appleConfigured()) return;
  await fetch(`${APPLE_ISSUER}/auth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.APPLE_BUNDLE_ID!,
      client_secret: await appleClientSecret(),
      token: refreshToken,
      token_type_hint: "refresh_token",
    }),
  }).catch(() => {});
}
