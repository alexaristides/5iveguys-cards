import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { clubEmail, parseConsent, playerEmail, type ConsentRecord } from "@/lib/player-consent";

/**
 * A signed player consent from /consent. Emailed in full (bank details included) to
 * CONSENT_EMAIL_TO, replying to the player, with a short copy to the player. Not stored.
 * Needs RESEND_API_KEY (Resend, from the Vercel Marketplace) and a sender on a domain verified
 * in Resend: CONSENT_EMAIL_FROM, "5iveG <consent@5iveg.com>" by default.
 */

// A few forms an hour from one address is plenty: anything more is someone hammering the inbox.
const recent = new Map<string, number[]>();
const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

function tooMany(ip: string): boolean {
  const now = Date.now();
  const times = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= LIMIT) return true;
  recent.set(ip, [...times, now]);
  if (recent.size > 5000) recent.clear();
  return false;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  // Honeypot: the form hides this field, so only bots fill it. Pretend it worked.
  if (typeof body.website === "string" && body.website.trim()) return NextResponse.json({ ok: true, reference: "OK" });

  const parsed = parseConsent(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || null;
  if (tooMany(ip ?? "unknown")) {
    return NextResponse.json({ error: "We've had a few forms from you already. Please try again in an hour." }, { status: 429 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONSENT_EMAIL_TO;
  if (!apiKey || !to) {
    console.error("[consent] RESEND_API_KEY or CONSENT_EMAIL_TO is not set");
    return NextResponse.json({ error: "The form isn't set up to send yet. Please try again later." }, { status: 503 });
  }
  const from = process.env.CONSENT_EMAIL_FROM || "5iveG <consent@5iveg.com>";
  const resend = new Resend(apiKey);

  const record: ConsentRecord = {
    reference: randomUUID().slice(0, 8).toUpperCase(),
    signedAt: new Date(),
    ip,
    userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
  };
  const consent = parsed.value;

  const club = clubEmail(consent, record);
  const { error } = await resend.emails.send({
    from,
    to: to.split(",").map((s) => s.trim()).filter(Boolean),
    replyTo: consent.email,
    subject: club.subject,
    html: club.html,
    text: club.text,
  });
  if (error) {
    // Never log the form itself: it holds bank details.
    console.error("[consent] club email failed:", error.name, error.message);
    return NextResponse.json({ error: "We couldn't send your form. Please try again in a minute." }, { status: 502 });
  }

  // The player's copy is a courtesy: the form counts once the club has it.
  const copy = playerEmail(consent, record, new URL("/support", req.nextUrl.origin).toString());
  const sent = await resend.emails
    .send({ from, to: consent.email, subject: copy.subject, html: copy.html, text: copy.text })
    .catch((err: Error) => ({ error: err }));
  if (sent.error) console.error("[consent] player copy failed:", sent.error.message);

  return NextResponse.json({ ok: true, reference: record.reference, copySent: !sent.error });
}
