import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Period = "day" | "week" | "month" | "alltime";

const PERIOD_MS: Record<Exclude<Period, "alltime">, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

function parseYoutubeCounts(sync: { likedVideoIds: string; earlyLikedVideoIds: string } | null) {
  return {
    likedCount: sync ? JSON.parse(sync.likedVideoIds || "[]").length : 0,
    earlyLikedCount: sync ? JSON.parse(sync.earlyLikedVideoIds || "[]").length : 0,
  };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUserId = session.user.id;
  const rawPeriod = req.nextUrl.searchParams.get("period") ?? "alltime";
  const period: Period = (["day", "week", "month", "alltime"] as const).includes(rawPeriod as Period)
    ? (rawPeriod as Period)
    : "alltime";

  const channelSlug = req.nextUrl.searchParams.get("channelSlug");
  const channel = channelSlug
    ? await prisma.channel.findUnique({ where: { slug: channelSlug } })
    : null;
  const channelId = channel?.id ?? null;

  // ── Period-based ranking via PointsEvent ──────────────────────────────────
  if (period !== "alltime") {
    const cutoff = new Date(Date.now() - PERIOD_MS[period]);

    const scores = await prisma.pointsEvent.groupBy({
      by: ["userId"],
      where: {
        earnedAt: { gte: cutoff },
        isFanPoint: true,
        ...(channelId ? { channelId } : {}),
      },
      _sum: { points: true },
      orderBy: { _sum: { points: "desc" } },
      take: 50,
    });

    if (scores.length === 0) {
      return NextResponse.json({ leaderboard: [], currentUserRank: null });
    }

    const userIds = scores.map((s) => s.userId);
    const [users, youtubeSyncs, cardCounts] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, image: true } }),
      channelId
        ? prisma.youtubeSync.findMany({ where: { userId: { in: userIds }, channelId }, select: { userId: true, isSubscribed: true, likedVideoIds: true, earlyLikedVideoIds: true } })
        : Promise.resolve([]),
      channelId
        ? prisma.userCard.groupBy({ by: ["userId"], where: { userId: { in: userIds }, channelId }, _count: true })
        : prisma.userCard.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _count: true }),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const syncMap = new Map((youtubeSyncs as { userId: string; isSubscribed: boolean; likedVideoIds: string; earlyLikedVideoIds: string }[]).map((s) => [s.userId, s]));
    const cardCountMap = new Map((cardCounts as { userId: string; _count: number }[]).map((c) => [c.userId, c._count]));
    const currentUserRank = scores.findIndex((s) => s.userId === currentUserId) + 1;

    return NextResponse.json({
      leaderboard: scores.map((s, i) => {
        const u = userMap.get(s.userId);
        if (!u) return null;
        const sync = syncMap.get(s.userId) ?? null;
        return {
          rank: i + 1,
          id: u.id,
          name: u.name,
          image: u.image,
          score: s._sum.points ?? 0,
          cardCount: cardCountMap.get(s.userId) ?? 0,
          isSubscribed: sync?.isSubscribed ?? false,
          ...parseYoutubeCounts(sync),
          isCurrentUser: u.id === currentUserId,
          rankChange: 0,
        };
      }).filter(Boolean),
      currentUserRank: currentUserRank || null,
    });
  }

  // ── All-time ranking via UserChannelStats ─────────────────────────────────
  if (channelId) {
    const channelStats = await prisma.userChannelStats.findMany({
      where: { channelId, fanTotalEarned: { gt: 0 } },
      orderBy: { fanTotalEarned: "desc" },
      take: 50,
      include: { user: { select: { id: true, name: true, image: true } } },
    });

    const userIds = channelStats.map((s) => s.userId);
    const currentUserRank = channelStats.findIndex((s) => s.userId === currentUserId) + 1;

    const [youtubeSyncs, cardCounts] = await Promise.all([
      prisma.youtubeSync.findMany({ where: { userId: { in: userIds }, channelId }, select: { userId: true, isSubscribed: true, likedVideoIds: true, earlyLikedVideoIds: true } }),
      prisma.userCard.groupBy({ by: ["userId"], where: { userId: { in: userIds }, channelId }, _count: true }),
    ]);

    const syncMap = new Map(youtubeSyncs.map((s) => [s.userId, s]));
    const cardCountMap = new Map((cardCounts as { userId: string; _count: number }[]).map((c) => [c.userId, c._count]));

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const [latestSnapshot, comparisonSnapshots] = await Promise.all([
      prisma.rankSnapshot.findFirst({
        where: { userId: { in: userIds }, channelId },
        orderBy: { snapshotAt: "desc" },
        select: { snapshotAt: true },
      }),
      prisma.rankSnapshot.findMany({
        where: { userId: { in: userIds }, channelId, snapshotAt: { lte: twoHoursAgo } },
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
        data: channelStats.map((s, i) => ({ userId: s.userId, channelId, rank: i + 1, totalEarned: s.fanTotalEarned })),
      });
    }

    return NextResponse.json({
      leaderboard: channelStats.map((s, i) => {
        const sync = syncMap.get(s.userId) ?? null;
        const prev = previousRankMap.get(s.userId);
        return {
          rank: i + 1,
          id: s.user.id,
          name: s.user.name,
          image: s.user.image,
          points: s.points,
          totalEarned: s.totalEarned,
          fanTotalEarned: s.fanTotalEarned,
          score: s.fanTotalEarned,
          cardCount: cardCountMap.get(s.userId) ?? 0,
          isSubscribed: sync?.isSubscribed ?? false,
          ...parseYoutubeCounts(sync),
          isCurrentUser: s.userId === currentUserId,
          rankChange: prev != null ? prev - (i + 1) : 0,
        };
      }),
      currentUserRank: currentUserRank || null,
    });
  }

  // ── Global all-time (no channel filter) ───────────────────────────────────
  const users = await prisma.user.findMany({
    where: { totalEarned: { gt: 0 } },
    orderBy: { totalEarned: "desc" },
    take: 50,
    select: {
      id: true, name: true, image: true, points: true, totalEarned: true,
      _count: { select: { cards: true } },
      youtubeSync: { select: { isSubscribed: true, likedVideoIds: true, earlyLikedVideoIds: true }, take: 1 },
    },
  });

  const currentUserRank = users.findIndex((u) => u.id === currentUserId) + 1;
  return NextResponse.json({
    leaderboard: users.map((u, i) => ({
      rank: i + 1,
      id: u.id,
      name: u.name,
      image: u.image,
      points: u.points,
      totalEarned: u.totalEarned,
      score: u.totalEarned,
      cardCount: u._count.cards,
      isSubscribed: u.youtubeSync[0]?.isSubscribed ?? false,
      ...parseYoutubeCounts(u.youtubeSync[0] ?? null),
      isCurrentUser: u.id === currentUserId,
      rankChange: 0,
    })),
    currentUserRank: currentUserRank || null,
  });
}
