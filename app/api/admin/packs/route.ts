import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { earnings } from "@/lib/player-packs-db";

const isAdmin = (req: NextRequest) =>
  !!process.env.ADMIN_SECRET && req.headers.get("x-admin-secret") === process.env.ADMIN_SECRET;

/** Player pack sales and what each player is owed. `?tests=1` includes TestFlight/sandbox purchases. */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await earnings({ includeTests: req.nextUrl.searchParams.get("tests") === "1" }));
}

/** Record money paid to a player ({ action: "payout", channelId, playerName, amountPence, note? }) or undo one ({ action: "deletePayout", id }). */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  if (body.action === "payout") {
    const amountPence = Number(body.amountPence);
    const channelId = str(body.channelId);
    const playerName = str(body.playerName);
    if (!channelId || !playerName) return NextResponse.json({ error: "Pick a player." }, { status: 400 });
    if (!Number.isInteger(amountPence) || amountPence <= 0) return NextResponse.json({ error: "Enter an amount." }, { status: 400 });
    const payout = await prisma.playerPayout.create({ data: { channelId, playerName, amountPence, note: str(body.note) || null } });
    return NextResponse.json({ payout });
  }
  if (body.action === "deletePayout") {
    await prisma.playerPayout.delete({ where: { id: str(body.id) } }).catch(() => null);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
