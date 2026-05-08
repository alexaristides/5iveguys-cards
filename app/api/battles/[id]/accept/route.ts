import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CARDS_BY_ID, CAP_COSTS, SALARY_CAP } from "@/lib/cards";
import { resolveMatch } from "@/lib/battles";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const battle = await prisma.cardBattle.findUnique({ where: { id } });

    if (!battle) {
      return NextResponse.json({ error: "Battle not found" }, { status: 404 });
    }
    if (battle.status !== "PENDING") {
      return NextResponse.json({ error: "This battle is no longer open" }, { status: 400 });
    }
    if (battle.challengerId === session.user.id) {
      return NextResponse.json({ error: "You cannot accept your own challenge" }, { status: 403 });
    }

    const body = await req.json();
    const { cardIds } = body as { cardIds?: string[] };

    if (!Array.isArray(cardIds) || cardIds.length !== 3) {
      return NextResponse.json({ error: "Exactly 3 cardIds required" }, { status: 400 });
    }

    const acceptorCards = cardIds.map((id) => CARDS_BY_ID[id]);
    if (acceptorCards.some((c) => !c)) {
      return NextResponse.json({ error: "One or more invalid cardIds" }, { status: 400 });
    }

    const capCost = acceptorCards.reduce((sum, c) => sum + CAP_COSTS[c.rarity], 0);
    if (capCost > SALARY_CAP) {
      return NextResponse.json(
        { error: `Squad exceeds salary cap (${capCost}/${SALARY_CAP})` },
        { status: 400 }
      );
    }

    const acceptor = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!acceptor || acceptor.points < battle.wager) {
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

    // Guard: acceptor can't use cards they've already committed to their own pending challenges
    const lockedBattle = await prisma.cardBattle.findFirst({
      where: {
        challengerId: session.user.id,
        status: "PENDING",
        challengerCardIds: { hasSome: cardIds },
      },
    });
    if (lockedBattle) {
      return NextResponse.json(
        { error: "One or more cards are already committed to another challenge" },
        { status: 400 }
      );
    }

    const matchResults = resolveMatch(battle.challengerCardIds, cardIds);
    const { overallWinner } = matchResults;
    const pot = battle.wager * 2;
    const tie = overallWinner === "tie";
    const winnerId = tie
      ? null
      : overallWinner === "challenger"
      ? battle.challengerId
      : session.user.id;

    const deductAcceptor = prisma.user.update({
      where: { id: session.user.id },
      data: { points: { decrement: battle.wager } },
    });

    // updateMany guards against race condition — count === 0 means already resolved
    const resolveBattle = prisma.cardBattle.updateMany({
      where: { id, status: "PENDING" },
      data: {
        acceptorId: session.user.id,
        acceptorCardIds: cardIds,
        status: "RESOLVED",
        matchResults: matchResults as object,
        winnerId,
        resolvedAt: new Date(),
      },
    });

    const awardOps = tie
      ? [
          prisma.user.update({ where: { id: battle.challengerId }, data: { points: { increment: battle.wager } } }),
          prisma.user.update({ where: { id: session.user.id }, data: { points: { increment: battle.wager } } }),
        ]
      : winnerId
      ? [prisma.user.update({ where: { id: winnerId }, data: { points: { increment: pot } } })]
      : [];

    const results = await prisma.$transaction([deductAcceptor, resolveBattle, ...awardOps]);
    const updateResult = results[1] as { count: number };
    if (updateResult.count === 0) {
      return NextResponse.json({ error: "Battle was just accepted by someone else" }, { status: 409 });
    }

    const updatedAcceptor = await prisma.user.findUnique({ where: { id: session.user.id } });

    return NextResponse.json({
      winnerId,
      matchResults,
      pot,
      tie,
      remainingPoints: updatedAcceptor?.points ?? 0,
    });
  } catch (err) {
    console.error("[POST /api/battles/[id]/accept]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
