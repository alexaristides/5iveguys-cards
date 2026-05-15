import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    where: { totalEarned: { gt: 0 } },
    orderBy: { totalEarned: "desc" },
    take: 50,
    select: {
      id: true,
      name: true,
      image: true,
      points: true,
      totalEarned: true,
      createdAt: true,
      _count: { select: { cards: true } },
      youtubeSync: {
        select: {
          isSubscribed: true,
          likedVideoIds: true,
          earlyLikedVideoIds: true,
        },
      },
    },
  });

  const currentUserId = session.user.id;
  const currentUserRank = users.findIndex((u) => u.id === currentUserId) + 1;
  const userIds = users.map((u) => u.id);

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const [latestSnapshot, comparisonSnapshots] = await Promise.all([
    prisma.rankSnapshot.findFirst({
      where: { userId: { in: userIds } },
      orderBy: { snapshotAt: "desc" },
      select: { snapshotAt: true },
    }),
    prisma.rankSnapshot.findMany({
      where: { userId: { in: userIds }, snapshotAt: { lte: twoHoursAgo } },
      orderBy: { snapshotAt: "desc" },
      select: { userId: true, rank: true },
      take: 250,
    }),
  ]);

  const previousRankMap = new Map<string, number>();
  for (const snap of comparisonSnapshots) {
    if (!previousRankMap.has(snap.userId)) previousRankMap.set(snap.userId, snap.rank);
  }

  if (!latestSnapshot || latestSnapshot.snapshotAt < oneHourAgo) {
    await prisma.rankSnapshot.createMany({
      data: users.map((u, i) => ({ userId: u.id, rank: i + 1, totalEarned: u.totalEarned })),
    });
  }

  return NextResponse.json({
    leaderboard: users.map((u, i) => {
      const prev = previousRankMap.get(u.id);
      return {
        rank: i + 1,
        id: u.id,
        name: u.name,
        image: u.image,
        points: u.points,
        totalEarned: u.totalEarned,
        cardCount: u._count.cards,
        isSubscribed: u.youtubeSync?.isSubscribed ?? false,
        likedCount: u.youtubeSync ? JSON.parse(u.youtubeSync.likedVideoIds || "[]").length : 0,
        earlyLikedCount: u.youtubeSync ? JSON.parse(u.youtubeSync.earlyLikedVideoIds || "[]").length : 0,
        isCurrentUser: u.id === currentUserId,
        rankChange: prev != null ? prev - (i + 1) : 0,
      };
    }),
    currentUserRank: currentUserRank || null,
  });
}
