import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CARDS_BY_ID, CAP_COSTS, SALARY_CAP } from "@/lib/cards";
import { resolveMatch } from "@/lib/battles";
import { createNotification } from "@/lib/notifications";

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

    const acceptorCards = cardIds.map((cid) => CARDS_BY_ID[cid]);
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

    const userId = session.user.id;
    const channelId = battle.channelId ?? null;

    // Check acceptor has enough points (channel-scoped when possible)
    const acceptorPoints = await getPoints(userId, channelId);
    if (acceptorPoints < battle.wager) {
      return NextResponse.json({ error: "Insufficient points" }, { status: 400 });
    }

    // Verify acceptor owns the cards (channel-scoped when possible)
    for (const cardId of cardIds) {
      const owns = await prisma.userCard.findFirst({
        where: { userId, cardId, ...(channelId ? { channelId } : {}) },
      });
      if (!owns) {
        return NextResponse.json({ error: `You don't own card: ${cardId}` }, { status: 400 });
      }
    }

    // Guard: acceptor can't reuse cards already committed to a pending challenge
    const lockedBattle = await prisma.cardBattle.findFirst({
      where: {
        challengerId: userId,
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
      : userId;

    // Build atomic ops — channel-scoped if channelId present, else global User.points
    const deductAcceptor = channelId
      ? prisma.userChannelStats.upsert({
          where: { userId_channelId: { userId, channelId } },
          create: { userId, channelId, points: -battle.wager, totalEarned: 0 },
          update: { points: { decrement: battle.wager } },
        })
      : prisma.user.update({ where: { id: userId }, data: { points: { decrement: battle.wager } } });

    // updateMany guards against race condition — count === 0 means already resolved
    const resolveBattle = prisma.cardBattle.updateMany({
      where: { id, status: "PENDING" },
      data: {
        acceptorId: userId,
        acceptorCardIds: cardIds,
        status: "RESOLVED",
        matchResults: matchResults as object,
        winnerId,
        resolvedAt: new Date(),
      },
    });

    const awardOps = tie
      ? buildAward(battle.challengerId, userId, battle.wager, channelId) // refund both
      : winnerId
      ? buildAward(winnerId, null, pot, channelId) // winner takes pot
      : [];

    const results = await prisma.$transaction([deductAcceptor, resolveBattle, ...awardOps]);
    const updateResult = results[1] as { count: number };
    if (updateResult.count === 0) {
      return NextResponse.json({ error: "Battle was just accepted by someone else" }, { status: 409 });
    }

    const remainingPoints = await getPoints(userId, channelId);

    // Resolve channel slug for notification links
    const channelSlug = channelId
      ? (await prisma.channel.findUnique({ where: { id: channelId }, select: { slug: true } }))?.slug ?? null
      : null;
    const battleLink = channelSlug ? `/${channelSlug}/battles` : "/";

    if (tie) {
      await Promise.all([
        createNotification({ userId: battle.challengerId, type: "battle_tie", title: "Your battle ended in a tie 🤝", body: `Both players get their ${battle.wager} pts back.`, link: battleLink }),
        createNotification({ userId, type: "battle_tie", title: "Battle ended in a tie 🤝", body: `Both players get their ${battle.wager} pts back.`, link: battleLink }),
      ]);
    } else if (winnerId === battle.challengerId) {
      await Promise.all([
        createNotification({ userId: battle.challengerId, type: "battle_won", title: `You won the battle! 🏆`, body: `You took the ${pot} pt pot.`, link: battleLink }),
        createNotification({ userId, type: "battle_lost", title: "You lost the battle 😤", body: `Better luck next time — ${battle.wager} pts lost.`, link: battleLink }),
      ]);
    } else {
      await Promise.all([
        createNotification({ userId, type: "battle_won", title: `You won the battle! 🏆`, body: `You took the ${pot} pt pot.`, link: battleLink }),
        createNotification({ userId: battle.challengerId, type: "battle_lost", title: "You lost the battle 😤", body: `Better luck next time — ${battle.wager} pts lost.`, link: battleLink }),
      ]);
    }

    return NextResponse.json({
      winnerId,
      matchResults,
      pot,
      tie,
      remainingPoints,
    });
  } catch (err) {
    console.error("[POST /api/battles/[id]/accept]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getPoints(userId: string, channelId: string | null): Promise<number> {
  if (channelId) {
    const stats = await prisma.userChannelStats.findUnique({
      where: { userId_channelId: { userId, channelId } },
      select: { points: true },
    });
    return stats?.points ?? 0;
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { points: true } });
  return user?.points ?? 0;
}

function buildAward(
  primaryId: string,
  secondaryId: string | null,
  amount: number,
  channelId: string | null
) {
  const award = (uid: string) =>
    channelId
      ? prisma.userChannelStats.upsert({
          where: { userId_channelId: { userId: uid, channelId } },
          create: { userId: uid, channelId, points: amount, totalEarned: 0 },
          update: { points: { increment: amount } },
        })
      : prisma.user.update({ where: { id: uid }, data: { points: { increment: amount } } });

  return secondaryId ? [award(primaryId), award(secondaryId)] : [award(primaryId)];
}
