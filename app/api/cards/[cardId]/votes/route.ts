import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const STAT_FIELDS = ["attack", "defense", "speed", "strength", "skillMoves", "iq", "aura", "goalkeeping", "agility", "celebration", "clutch"] as const;

type Params = { params: Promise<{ cardId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { cardId } = await params;

  const votes = await prisma.cardVote.findMany({
    where: { cardId },
    select: { attack: true, defense: true, speed: true, strength: true, skillMoves: true, iq: true, aura: true, goalkeeping: true, agility: true, celebration: true, clutch: true, userId: true },
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
      userVote = { attack: existing.attack, defense: existing.defense, speed: existing.speed, strength: existing.strength, skillMoves: existing.skillMoves, iq: existing.iq, aura: existing.aura, goalkeeping: existing.goalkeeping, agility: existing.agility, celebration: existing.celebration, clutch: existing.clutch };
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

  const userId = session.user.id;

  const existingVote = await prisma.cardVote.findUnique({
    where: { userId_cardId: { userId, cardId } },
    select: { userId: true },
  });

  const data = {
    userId,
    cardId,
    attack: body.attack,
    defense: body.defense,
    speed: body.speed,
    strength: body.strength,
    skillMoves: body.skillMoves,
    iq: body.iq,
    aura: body.aura,
    goalkeeping: body.goalkeeping,
    agility: body.agility,
    celebration: body.celebration,
    clutch: body.clutch,
  };

  const isFirstVote = !existingVote;

  await prisma.cardVote.upsert({
    where: { userId_cardId: { userId, cardId } },
    create: data,
    update: {
      attack: body.attack, defense: body.defense, speed: body.speed,
      strength: body.strength, skillMoves: body.skillMoves, iq: body.iq,
      aura: body.aura, goalkeeping: body.goalkeeping, agility: body.agility,
      celebration: body.celebration, clutch: body.clutch,
    },
  });

  if (isFirstVote) {
    const card = await prisma.card.findUnique({ where: { id: cardId }, select: { channelId: true } });
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { points: { increment: 10 }, totalEarned: { increment: 10 } },
      }),
      prisma.pointsEvent.create({
        data: { userId, channelId: card?.channelId ?? null, type: "card_rating", points: 10 },
      }),
    ]);
  }

  // Write a rating snapshot so leaderboard history is trackable
  const allVotes = await prisma.cardVote.findMany({
    where: { cardId },
    select: { attack: true, defense: true, speed: true, strength: true, skillMoves: true, iq: true, aura: true, goalkeeping: true, agility: true, celebration: true, clutch: true },
  });
  if (allVotes.length > 0) {
    const total = allVotes.reduce((sum, v) =>
      sum + v.attack + v.defense + v.speed + v.strength + v.skillMoves +
      v.iq + v.aura + v.goalkeeping + v.agility + v.celebration + v.clutch, 0);
    await prisma.cardRatingSnapshot.create({
      data: { cardId, overall: total / (allVotes.length * 11), voteCount: allVotes.length },
    });
  }

  return NextResponse.json({ ok: true, pointsEarned: isFirstVote ? 10 : 0 });
}
