import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const STAT_FIELDS = ["goalkeeping", "strength", "speed", "agility", "celebration", "clutch"] as const;

type Params = { params: Promise<{ cardId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { cardId } = await params;

  const votes = await prisma.cardVote.findMany({
    where: { cardId },
    select: { goalkeeping: true, strength: true, speed: true, agility: true, celebration: true, clutch: true, userId: true },
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
      userVote = { goalkeeping: existing.goalkeeping, strength: existing.strength, speed: existing.speed, agility: existing.agility, celebration: existing.celebration, clutch: existing.clutch };
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
    goalkeeping: body.goalkeeping,
    strength: body.strength,
    speed: body.speed,
    agility: body.agility,
    celebration: body.celebration,
    clutch: body.clutch,
  };

  await prisma.cardVote.upsert({
    where: { userId_cardId: { userId: session.user.id, cardId } },
    create: data,
    update: {
      goalkeeping: body.goalkeeping,
      strength: body.strength,
      speed: body.speed,
      agility: body.agility,
      celebration: body.celebration,
      clutch: body.clutch,
    },
  });

  return NextResponse.json({ ok: true });
}
