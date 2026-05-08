import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CARDS_BY_ID } from "@/lib/cards";
import { MIN_WAGER } from "@/lib/battles";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10)));
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    prisma.cardBattle.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        challenger: { select: { id: true, name: true, image: true } },
      },
    }),
    prisma.cardBattle.count({ where: { status: "PENDING" } }),
  ]);

  const battles = rows.map((b) => ({
    ...b,
    createdAt: b.createdAt.toISOString(),
    challengerCard: CARDS_BY_ID[b.challengerCardId] ?? null,
  }));

  return NextResponse.json({ battles, total, page, totalPages: Math.ceil(total / limit) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { cardId, wager } = body as { cardId?: string; wager?: number };

  if (!cardId || typeof wager !== "number") {
    return NextResponse.json({ error: "cardId and wager are required" }, { status: 400 });
  }
  if (wager < MIN_WAGER) {
    return NextResponse.json({ error: `Minimum wager is ${MIN_WAGER} points` }, { status: 400 });
  }
  if (!CARDS_BY_ID[cardId]) {
    return NextResponse.json({ error: "Invalid card" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.points < wager) {
    return NextResponse.json({ error: "Insufficient points" }, { status: 400 });
  }

  const owns = await prisma.userCard.findFirst({
    where: { userId: session.user.id, cardId },
  });
  if (!owns) {
    return NextResponse.json({ error: "You don't own this card" }, { status: 400 });
  }

  const activeBattle = await prisma.cardBattle.findFirst({
    where: { challengerCardId: cardId, challengerId: session.user.id, status: "PENDING" },
  });
  if (activeBattle) {
    return NextResponse.json({ error: "This card is already in an active challenge" }, { status: 400 });
  }

  const [, battle] = await prisma.$transaction([
    prisma.user.update({
      where: { id: session.user.id },
      data: { points: { decrement: wager } },
    }),
    prisma.cardBattle.create({
      data: { challengerId: session.user.id, challengerCardId: cardId, wager },
    }),
  ]);

  const updatedUser = await prisma.user.findUnique({ where: { id: session.user.id } });

  return NextResponse.json({ battle, remainingPoints: updatedUser?.points ?? 0 });
}
