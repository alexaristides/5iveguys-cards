import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const channelSlug = req.nextUrl.searchParams.get("channelSlug");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, image: true, totalEarned: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Channel-specific enrichment
  if (channelSlug) {
    const channel = await prisma.channel.findUnique({ where: { slug: channelSlug } });

    if (channel) {
      const [channelStats, channelCards, youtubeSync] = await Promise.all([
        prisma.userChannelStats.findUnique({
          where: { userId_channelId: { userId, channelId: channel.id } },
        }),
        prisma.userCard.findMany({
          where: { userId, channelId: channel.id },
          select: { cardId: true },
        }),
        prisma.youtubeSync.findFirst({
          where: { userId, channelId: channel.id },
          select: { isSubscribed: true, likedVideoIds: true, earlyLikedVideoIds: true },
        }),
      ]);

      const ownedCardIds = channelCards.map((c) => c.cardId);
      const likedCount = youtubeSync
        ? (JSON.parse(youtubeSync.likedVideoIds || "[]") as string[]).length
        : 0;
      const earlyLikedCount = youtubeSync
        ? (JSON.parse(youtubeSync.earlyLikedVideoIds || "[]") as string[]).length
        : 0;

      return NextResponse.json({
        id: user.id,
        name: user.name,
        image: user.image,
        totalEarned: channelStats?.totalEarned ?? user.totalEarned,
        cardCount: ownedCardIds.length,
        ownedCardIds,
        watchTimeSeconds: channelStats?.watchTimeSeconds ?? 0,
        isSubscribed: youtubeSync?.isSubscribed ?? false,
        likedCount,
        earlyLikedCount,
      });
    }
  }

  // Fallback: global profile (no channel context)
  const allCards = await prisma.userCard.findMany({
    where: { userId },
    select: { cardId: true },
  });

  return NextResponse.json({
    id: user.id,
    name: user.name,
    image: user.image,
    totalEarned: user.totalEarned,
    cardCount: allCards.length,
    ownedCardIds: allCards.map((c) => c.cardId),
    watchTimeSeconds: 0,
    isSubscribed: false,
    likedCount: 0,
    earlyLikedCount: 0,
  });
}
