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
  const channelSlug = searchParams.get("channelSlug");

  // Resolve channel filter
  const channel = channelSlug
    ? await prisma.channel.findUnique({ where: { slug: channelSlug }, select: { id: true } })
    : null;

  const whereClause = {
    status: "PENDING" as const,
    ...(channel ? { channelId: channel.id } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.cardBattle.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        challenger: { select: { id: true, name: true, image: true } },
      },
    }),
    prisma.cardBattle.count({ where: whereClause }),
  ]);

  const battles = rows.map((b) => ({
    id: b.id,
    channelId: b.channelId,
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
    const { cardIds, wager, channelSlug } = body as {
      cardIds?: string[];
      wager?: number;
      channelSlug?: string;
    };

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

    const userId = session.user.id;

    // Resolve channel
    const channel = channelSlug
      ? await prisma.channel.findUnique({ where: { slug: channelSlug }, select: { id: true } })
      : null;
    const channelId = channel?.id ?? null;

    // Check points from per-channel stats (or global fallback)
    const currentPoints = await getPoints(userId, channelId);
    if (currentPoints < wager) {
      return NextResponse.json({ error: "Insufficient points" }, { status: 400 });
    }

    // Verify card ownership (channel-scoped when possible)
    for (const cardId of cardIds) {
      const owns = await prisma.userCard.findFirst({
        where: {
          userId,
          cardId,
          ...(channelId ? { channelId } : {}),
        },
      });
      if (!owns) {
        return NextResponse.json({ error: `You don't own card: ${cardId}` }, { status: 400 });
      }
    }

    const activeBattle = await prisma.cardBattle.findFirst({
      where: {
        challengerId: userId,
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

    // Deduct wager from channel stats
    const deductOp = channelId
      ? prisma.userChannelStats.upsert({
          where: { userId_channelId: { userId, channelId } },
          create: { userId, channelId, points: -wager, totalEarned: 0 },
          update: { points: { decrement: wager } },
        })
      : prisma.user.update({ where: { id: userId }, data: { points: { decrement: wager } } });

    const [, battle] = await prisma.$transaction([
      deductOp,
      prisma.cardBattle.create({
        data: {
          challengerId: userId,
          challengerCardIds: cardIds,
          wager,
          ...(channelId ? { channelId } : {}),
        },
      }),
    ]);

    const remainingPoints = await getPoints(userId, channelId);

    return NextResponse.json({ battle, remainingPoints });
  } catch (err) {
    console.error("[POST /api/battles]", err);
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
