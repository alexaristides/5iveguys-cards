import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CARDS_BY_ID } from "@/lib/cards";
import { rollForRarity } from "@/lib/battles";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const { cardId } = body as { cardId?: string };

  if (!cardId || !CARDS_BY_ID[cardId]) {
    return NextResponse.json({ error: "Invalid card" }, { status: 400 });
  }

  const acceptor = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!acceptor || acceptor.points < battle.wager) {
    return NextResponse.json({ error: "Insufficient points" }, { status: 400 });
  }

  const owns = await prisma.userCard.findFirst({
    where: { userId: session.user.id, cardId },
  });
  if (!owns) {
    return NextResponse.json({ error: "You don't own this card" }, { status: 400 });
  }

  const lockedBattle = await prisma.cardBattle.findFirst({
    where: { acceptorCardId: cardId, acceptorId: session.user.id, status: "PENDING" },
  });
  if (lockedBattle) {
    return NextResponse.json({ error: "That card is already in an active challenge" }, { status: 400 });
  }

  const challengerCard = CARDS_BY_ID[battle.challengerCardId];
  const acceptorCard = CARDS_BY_ID[cardId];

  const challengerRoll = rollForRarity(challengerCard.rarity);
  const acceptorRoll = rollForRarity(acceptorCard.rarity);
  const pot = battle.wager * 2;
  const tie = challengerRoll === acceptorRoll;
  const winnerId = tie
    ? null
    : challengerRoll > acceptorRoll
    ? battle.challengerId
    : session.user.id;

  const deductAcceptor = prisma.user.update({
    where: { id: session.user.id },
    data: { points: { decrement: battle.wager } },
  });
  // updateMany guards against race condition: if another request already resolved
  // this battle, count will be 0 and we can detect it after the transaction.
  const resolveBattle = prisma.cardBattle.updateMany({
    where: { id, status: "PENDING" },
    data: {
      acceptorId: session.user.id,
      acceptorCardId: cardId,
      status: "RESOLVED",
      challengerRoll,
      acceptorRoll,
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
  // results[1] is the updateMany result
  const updateResult = results[1] as { count: number };
  if (updateResult.count === 0) {
    return NextResponse.json({ error: "Battle was just accepted by someone else" }, { status: 409 });
  }

  const updatedAcceptor = await prisma.user.findUnique({ where: { id: session.user.id } });

  return NextResponse.json({
    winnerId,
    challengerRoll,
    acceptorRoll,
    pot,
    tie,
    remainingPoints: updatedAcceptor?.points ?? 0,
  });
}
