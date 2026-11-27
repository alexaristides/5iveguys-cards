// Email sign-in with a 6-digit code, for the website and the app.
//
// POST /api/sign-in/email sends the code; /api/sign-in/email/verify (website, sets the session
// cookie) or /api/mobile/auth/email (app, returns a token) checks it. A code lasts 10 minutes and
// allows 5 tries; an address gets at most 5 codes an hour, 30 s apart. Codes are stored hashed
// (EmailSignInCode), one row per address, deleted once used.
//
// The code proves the person owns the address, so it signs them in to the profile with that email
// (e.g. one made with Google), or makes a new profile, asking for a name first.
//
// Needs RESEND_API_KEY and EMAIL_FROM, a sender on a domain verified in Resend (e.g.
// "5iveG <hello@5iveg.com>"); without them the email option is hidden. In `next dev` without
// them, the code is printed in the server log instead of emailed.

import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { Resend } from "resend";
import { prisma } from "./db";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_GAP_MS = 30 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
export const MAX_ATTEMPTS = 5;

const canEmail = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
export const emailSignInConfigured = () => canEmail() || process.env.NODE_ENV === "development";

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/.test(email)) return null;
  return email;
}

/** A display name someone typed: trimmed, single-spaced, 1–40 characters. */
export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 40 ? name : null;
}

export function generateCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashCode(email: string, code: string) {
  return createHmac("sha256", process.env.NEXTAUTH_SECRET ?? "").update(`${email}:${code}`).digest("hex");
}

interface SendWindow {
  sentAt: Date;
  hourStart: Date;
  hourSends: number;
}

/** Whether another code may go to an address now, given its last sends. */
export function sendAllowed(prev: SendWindow | null, now: number):
  | { ok: true; hourStart: Date; hourSends: number }
  | { ok: false; retryAfterS: number } {
  if (!prev) return { ok: true, hourStart: new Date(now), hourSends: 1 };
  const sinceLast = now - prev.sentAt.getTime();
  if (sinceLast < RESEND_GAP_MS) return { ok: false, retryAfterS: Math.ceil((RESEND_GAP_MS - sinceLast) / 1000) };
  const windowEnds = prev.hourStart.getTime() + HOUR_MS;
  if (now >= windowEnds) return { ok: true, hourStart: new Date(now), hourSends: 1 };
  if (prev.hourSends >= MAX_SENDS_PER_HOUR) return { ok: false, retryAfterS: Math.ceil((windowEnds - now) / 1000) };
  return { ok: true, hourStart: prev.hourStart, hourSends: prev.hourSends + 1 };
}

export type SendResult = { ok: true } | { ok: false; status: number; error: string };

export async function sendSignInCode(rawEmail: unknown): Promise<SendResult> {
  if (!emailSignInConfigured()) return { ok: false, status: 503, error: "Email sign-in isn't available right now." };
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, status: 400, error: "Enter a valid email address." };

  const now = Date.now();
  // Forget addresses that asked for a code a day ago and never used it.
  await prisma.emailSignInCode.deleteMany({ where: { sentAt: { lt: new Date(now - 24 * HOUR_MS) } } });

  const prev = await prisma.emailSignInCode.findUnique({ where: { email } });
  const allowed = sendAllowed(prev, now);
  if (!allowed.ok) {
    const wait = allowed.retryAfterS > 90 ? `${Math.ceil(allowed.retryAfterS / 60)} minutes` : `${allowed.retryAfterS} seconds`;
    return { ok: false, status: 429, error: `Too many codes. Try again in ${wait}.` };
  }

  const code = generateCode();
  const data = {
    codeHash: hashCode(email, code),
    expires: new Date(now + CODE_TTL_MS),
    attempts: 0,
    sentAt: new Date(now),
    hourStart: allowed.hourStart,
    hourSends: allowed.hourSends,
  };
  await prisma.emailSignInCode.upsert({ where: { email }, create: { email, ...data }, update: data });

  if (!canEmail()) {
    console.log(`[email sign-in] code for ${email}: ${code}`); // next dev only (emailSignInConfigured)
    return { ok: true };
  }
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.EMAIL_FROM!,
    to: email,
    subject: `${code} is your 5iveG code`,
    text: `Your 5iveG sign-in code is ${code}\n\nIt works for 10 minutes. If you didn't ask for it, you can ignore this email.`,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#160B2E;max-width:420px">
  <p style="font-size:16px">Your 5iveG sign-in code is</p>
  <p style="font-size:34px;font-weight:900;letter-spacing:6px;margin:8px 0 16px">${code}</p>
  <p style="font-size:14px;color:#4B4462">It works for 10 minutes. If you didn't ask for it, you can ignore this email.</p>
</div>`,
  });
  if (error) {
    console.error("[email sign-in] send failed", error);
    await prisma.emailSignInCode.delete({ where: { email } }).catch(() => {});
    return { ok: false, status: 502, error: "We couldn't send the email. Check the address and try again." };
  }
  return { ok: true };
}

export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string; needsName?: true };

/**
 * Check a code and find or create the profile for the address. A new profile needs a name: without
 * one this answers `needsName` (the code stays valid, using up a try) and the caller asks again with it.
 */
export async function verifySignInCode(rawEmail: unknown, rawCode: unknown, rawName?: unknown): Promise<VerifyResult> {
  const email = normalizeEmail(rawEmail);
  const code = typeof rawCode === "string" ? rawCode.replace(/\D/g, "") : "";
  if (!email || code.length !== 6) return { ok: false, status: 400, error: "Enter the 6-digit code from the email." };
  const expired = { ok: false as const, status: 400, error: "That code has expired. Send a new one." };

  // Count the try before comparing, so parallel guesses can't get past the limit.
  const now = new Date();
  const counted = await prisma.emailSignInCode.updateMany({
    where: { email, expires: { gt: now }, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0) return expired;
  const row = await prisma.emailSignInCode.findUnique({ where: { email } });
  if (!row) return expired;

  const given = Buffer.from(hashCode(email, code), "hex");
  const stored = Buffer.from(row.codeHash, "hex");
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
    const left = MAX_ATTEMPTS - row.attempts;
    return left > 0
      ? { ok: false, status: 400, error: `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` }
      : expired;
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, name: true, emailVerified: true },
  });
  const name = normalizeName(rawName);
  if (!user?.name && !name) {
    if (rawName !== undefined) return { ok: false, status: 400, error: "Enter your name (up to 40 characters).", needsName: true };
    return { ok: false, status: 400, error: "What's your name?", needsName: true };
  }

  await prisma.emailSignInCode.delete({ where: { email } }).catch(() => {});
  if (!user) {
    const created = await prisma.user.create({ data: { email, name, emailVerified: now }, select: { id: true } });
    return { ok: true, userId: created.id };
  }
  if (!user.name || !user.emailVerified) {
    await prisma.user.update({
      where: { id: user.id },
      data: { ...(!user.name && name ? { name } : {}), ...(!user.emailVerified ? { emailVerified: now } : {}) },
    });
  }
  return { ok: true, userId: user.id };
}
