import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const channelSlug = req.nextUrl.searchParams.get("channelSlug");

  if (!channelSlug) {
    // Legacy: return global user data
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { cards: { orderBy: { obtainedAt: "desc" } } },
    });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      points: user.points,
      totalEarned: user.totalEarned,
      cardCount: user.cards.length,
      cards: user.cards,
      youtubeSync: null,
    });
  }

  const channel = await prisma.channel.findUnique({ where: { slug: channelSlug } });
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const [stats, userCards, youtubeSync] = await Promise.all([
    prisma.userChannelStats.findUnique({
      where: { userId_channelId: { userId: session.user.id, channelId: channel.id } },
    }),
    prisma.userCard.findMany({
      where: { userId: session.user.id, channelId: channel.id },
      orderBy: { obtainedAt: "desc" },
    }),
    prisma.youtubeSync.findFirst({
      where: { userId: session.user.id, channelId: channel.id },
    }),
  ]);

  // Look up card data for owned cards
  const cardIds = userCards.map((uc) => uc.cardId);
  const cardData = cardIds.length > 0
    ? await prisma.card.findMany({ where: { id: { in: cardIds }, channelId: channel.id } })
    : [];
  const cardDataMap = new Map(cardData.map((c) => [c.id, c]));

  const cards = userCards.map((uc) => ({
    id: uc.id,
    cardId: uc.cardId,
    card: cardDataMap.get(uc.cardId) ?? null,
    obtainedAt: uc.obtainedAt,
    isFavorite: uc.isFavorite,
  }));

  return NextResponse.json({
    points: stats?.points ?? 0,
    totalEarned: stats?.totalEarned ?? 0,
    cardCount: userCards.length,
    cards,
    youtubeSync,
    youtubeChannelId: channel.youtubeChannelId,
  });
}
