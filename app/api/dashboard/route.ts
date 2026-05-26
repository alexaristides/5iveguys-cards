import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const userStats = await prisma.userChannelStats.findMany({
    where: { userId },
    include: {
      channel: {
        select: {
          id: true,
          slug: true,
          name: true,
          thumbnailUrl: true,
          description: true,
          isActive: true,
          rewardTags: true,
          _count: { select: { userStats: true } },
        },
      },
    },
    orderBy: { fanTotalEarned: "desc" },
  });

  // Backfill fanTotalEarned for users whose data predates the new field.
  // All pre-existing PointsEvents default to isFanPoint=true, so fanTotalEarned should equal totalEarned.
  const needsBackfill = userStats.filter((s) => s.fanTotalEarned === 0 && s.totalEarned > 0);
  if (needsBackfill.length > 0) {
    await Promise.all(
      needsBackfill.map((s) =>
        prisma.userChannelStats.update({ where: { id: s.id }, data: { fanTotalEarned: s.totalEarned } })
      )
    );
    needsBackfill.forEach((s) => { s.fanTotalEarned = s.totalEarned; });
  }

  const channelIds = userStats.map((s) => s.channelId);

  const [cardCounts, totalCards, rankCounts] = await Promise.all([
    prisma.userCard.groupBy({
      by: ["channelId"],
      where: { userId, channelId: { in: channelIds } },
      _count: true,
    }),
    prisma.card.groupBy({
      by: ["channelId"],
      where: { channelId: { in: channelIds } },
      _count: true,
    }),
    Promise.all(
      userStats.map((stat) =>
        prisma.userChannelStats.count({
          where: { channelId: stat.channelId, fanTotalEarned: { gt: stat.fanTotalEarned } },
        })
      )
    ),
  ]);

  const cardCountMap = new Map(cardCounts.map((c) => [c.channelId, c._count]));
  const totalCardsMap = new Map(totalCards.map((c) => [c.channelId, c._count]));

  const channels = userStats.map((stat, i) => ({
    slug: stat.channel.slug,
    name: stat.channel.name,
    thumbnailUrl: stat.channel.thumbnailUrl,
    description: stat.channel.description,
    isActive: stat.channel.isActive,
    rewardTags: stat.channel.rewardTags,
    fanCount: stat.channel._count.userStats,
    stats: {
      fanTotalEarned: stat.fanTotalEarned,
      bonusPoints: Math.max(0, stat.totalEarned - stat.fanTotalEarned),
      spendablePoints: stat.points,
      cardCount: cardCountMap.get(stat.channelId) ?? 0,
      totalCards: totalCardsMap.get(stat.channelId) ?? 0,
      rank: rankCounts[i] + 1,
    },
  }));

  return NextResponse.json({ channels });
}
