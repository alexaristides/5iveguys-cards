import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PACKS, openPackFromDb, DUPLICATE_REFUND, dbCardToCard, DbCard, CardResult } from "@/lib/cards";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { packId, channelSlug } = await req.json();
  const pack = PACKS.find((p) => p.id === packId);
  if (!pack) {
    return NextResponse.json({ error: "Invalid pack" }, { status: 400 });
  }

  const userId = session.user.id;

  // Resolve channel
  const channel = channelSlug
    ? await prisma.channel.findUnique({ where: { slug: channelSlug } })
    : await prisma.channel.findFirst({ where: { isActive: true } });

  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const channelId = channel.id;

  // Get or create per-channel stats
  const stats = await prisma.userChannelStats.findUnique({
    where: { userId_channelId: { userId, channelId } },
  });

  const currentPoints = stats?.points ?? 0;
  if (currentPoints < pack.cost) {
    return NextResponse.json({ error: "Insufficient points" }, { status: 400 });
  }

  // Load channel cards from DB
  const channelCards = await prisma.card.findMany({
    where: { channelId },
  }) as DbCard[];

  if (channelCards.length === 0) {
    return NextResponse.json({ error: "No cards available for this channel" }, { status: 400 });
  }

  const drawnDbCards = openPackFromDb(pack, channelCards);
  const drawnCardIds = drawnDbCards.map((c) => c.id);

  // Check for owned duplicates in this channel
  const owned = await prisma.userCard.findMany({
    where: { userId, channelId, cardId: { in: drawnCardIds } },
    select: { cardId: true },
  });
  const ownedSet = new Set(owned.map((c) => c.cardId));

  const seenInPack = new Set<string>();
  const cardResults: CardResult[] = [];
  let totalRefund = 0;

  for (const dbCard of drawnDbCards) {
    const card = dbCardToCard(dbCard);
    const isDuplicate = ownedSet.has(dbCard.id) || seenInPack.has(dbCard.id);
    const refundPoints = isDuplicate ? DUPLICATE_REFUND[card.rarity] : 0;
    if (!isDuplicate) seenInPack.add(dbCard.id);
    totalRefund += refundPoints;
    cardResults.push({ ...card, isDuplicate, refundPoints });
  }

  const seenForNew = new Set<string>();
  const trueNewCardIds: string[] = [];
  for (const dbCard of drawnDbCards) {
    if (!ownedSet.has(dbCard.id) && !seenForNew.has(dbCard.id)) {
      trueNewCardIds.push(dbCard.id);
    }
    seenForNew.add(dbCard.id);
  }

  await prisma.$transaction([
    // Deduct points from per-channel stats
    prisma.userChannelStats.upsert({
      where: { userId_channelId: { userId, channelId } },
      create: { userId, channelId, points: -(pack.cost - totalRefund), totalEarned: 0 },
      update: { points: { decrement: pack.cost - totalRefund } },
    }),
    prisma.packOpen.create({
      data: {
        userId,
        channelId,
        packType: pack.id,
        cardIds: JSON.stringify(drawnCardIds),
        pointCost: pack.cost,
      },
    }),
    ...trueNewCardIds.map((cardId) =>
      prisma.userCard.create({
        data: { userId, channelId, cardId },
      })
    ),
  ]);

  const updatedStats = await prisma.userChannelStats.findUnique({
    where: { userId_channelId: { userId, channelId } },
  });

  return NextResponse.json({
    cards: cardResults,
    remainingPoints: updatedStats?.points ?? 0,
    totalRefund,
    duplicateCount: cardResults.filter((c) => c.isDuplicate).length,
  });

}
