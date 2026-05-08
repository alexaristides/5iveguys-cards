import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CARDS_BY_ID, CAP_COSTS, SALARY_CAP } from "@/lib/cards";
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

  // Challenger's cards are intentionally omitted — blind wager mechanic
  const battles = rows.map((b) => ({
    id: b.id,
    challengerId: b.challengerId,
    challenger: b.challenger,
    wager: b.wager,
    createdAt: b.createdAt.toISOString(),
    status: b.status,
  }));

  return NextResponse.json({ battles, total, page, totalPages: Math.ceil(total / limit) });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { cardIds, wager } = body as { cardIds?: string[]; wager?: number };

    if (!Array.isArray(cardIds) || cardIds.length !== 3) {
      return NextResponse.json({ error: "Exactly 3 cardIds required" }, { status: 400 });
    }
    if (typeof wager !== "number" || wager < MIN_WAGER) {
      return NextResponse.json({ error: `Minimum wager is ${MIN_WAGER} points` }, { status: 400 });
    }

    const cards = cardIds.map((id) => CARDS_BY_ID[id]);
    if (cards.some((c) => !c)) {
      return NextResponse.json({ error: "One or more invalid cardIds" }, { status: 400 });
    }

    const capCost = cards.reduce((sum, c) => sum + CAP_COSTS[c.rarity], 0);
    if (capCost > SALARY_CAP) {
      return NextResponse.json(
        { error: `Squad exceeds salary cap (${capCost}/${SALARY_CAP})` },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user || user.points < wager) {
      return NextResponse.json({ error: "Insufficient points" }, { status: 400 });
    }

    for (const cardId of cardIds) {
      const owns = await prisma.userCard.findFirst({
        where: { userId: session.user.id, cardId },
      });
      if (!owns) {
        return NextResponse.json({ error: `You don't own card: ${cardId}` }, { status: 400 });
      }
    }

    const activeBattle = await prisma.cardBattle.findFirst({
      where: {
        challengerId: session.user.id,
        status: "PENDING",
        challengerCardIds: { hasSome: cardIds },
      },
    });
    if (activeBattle) {
      return NextResponse.json(
        { error: "One or more cards are already in an active challenge" },
        { status: 400 }
      );
    }

    const [, battle] = await prisma.$transaction([
      prisma.user.update({
        where: { id: session.user.id },
        data: { points: { decrement: wager } },
      }),
      prisma.cardBattle.create({
        data: { challengerId: session.user.id, challengerCardIds: cardIds, wager },
      }),
    ]);

    const updatedUser = await prisma.user.findUnique({ where: { id: session.user.id } });

    return NextResponse.json({ battle, remainingPoints: updatedUser?.points ?? 0 });
  } catch (err) {
    console.error("[POST /api/battles]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
