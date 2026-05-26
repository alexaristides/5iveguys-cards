import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const STAT_FIELDS = ["attack", "defense", "speed", "strength", "skillMoves", "iq", "aura"] as const;

type Params = { params: Promise<{ cardId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { cardId } = await params;

  const votes = await prisma.cardVote.findMany({
    where: { cardId },
    select: { attack: true, defense: true, speed: true, strength: true, skillMoves: true, iq: true, aura: true, userId: true },
  });

  const voteCount = votes.length;
  const averages: Record<string, number> = {};

  for (const stat of STAT_FIELDS) {
    averages[stat] = voteCount === 0 ? 0 : Math.round(votes.reduce((sum, v) => sum + v[stat], 0) / voteCount);
  }

  const session = await getServerSession(authOptions);
  let userVote: Record<string, number> | null = null;

  if (session?.user?.id) {
    const existing = votes.find((v) => v.userId === session.user.id);
    if (existing) {
      userVote = { attack: existing.attack, defense: existing.defense, speed: existing.speed, strength: existing.strength, skillMoves: existing.skillMoves, iq: existing.iq, aura: existing.aura };
    }
  }

  return NextResponse.json({ averages, userVote, voteCount });
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { cardId } = await params;
  const body = await req.json();

  for (const stat of STAT_FIELDS) {
    const val = body[stat];
    if (typeof val !== "number" || val < 0 || val > 100 || !Number.isInteger(val)) {
      return NextResponse.json({ error: `Invalid value for ${stat}` }, { status: 400 });
    }
  }

  const data = {
    userId: session.user.id,
    cardId,
    attack: body.attack,
    defense: body.defense,
    speed: body.speed,
    strength: body.strength,
    skillMoves: body.skillMoves,
    iq: body.iq,
    aura: body.aura,
  };

  await prisma.cardVote.upsert({
    where: { userId_cardId: { userId: session.user.id, cardId } },
    create: data,
    update: {
      attack: body.attack,
      defense: body.defense,
      speed: body.speed,
      strength: body.strength,
      skillMoves: body.skillMoves,
      iq: body.iq,
      aura: body.aura,
    },
  });

  return NextResponse.json({ ok: true });
}
