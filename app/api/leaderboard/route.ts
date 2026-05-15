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

const USER_SELECT = {
  id: true,
  name: true,
  image: true,
  points: true,
  totalEarned: true,
  _count: { select: { cards: true } },
  youtubeSync: {
    select: { isSubscribed: true, likedVideoIds: true, earlyLikedVideoIds: true },
  },
} as const;

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

  // ── Period-based ranking via PointsEvent ──────────────────────────────────
  if (period !== "alltime") {
    const cutoff = new Date(Date.now() - PERIOD_MS[period]);

    const scores = await prisma.pointsEvent.groupBy({
      by: ["userId"],
      where: { earnedAt: { gte: cutoff } },
      _sum: { points: true },
      orderBy: { _sum: { points: "desc" } },
      take: 50,
    });

    if (scores.length === 0) {
      return NextResponse.json({ leaderboard: [], currentUserRank: null });
    }

    const userIds = scores.map((s) => s.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: USER_SELECT,
    });

    const userMap = new Map(users.map((u) => [u.id, u]));
    const currentUserRank = scores.findIndex((s) => s.userId === currentUserId) + 1;

    return NextResponse.json({
      leaderboard: scores
        .map((s, i) => {
          const u = userMap.get(s.userId);
          if (!u) return null;
          return {
            rank: i + 1,
            id: u.id,
            name: u.name,
            image: u.image,
            points: u.points,
            totalEarned: u.totalEarned,
            score: s._sum.points ?? 0,
            cardCount: u._count.cards,
            isSubscribed: u.youtubeSync?.isSubscribed ?? false,
            ...parseYoutubeCounts(u.youtubeSync ?? null),
            isCurrentUser: u.id === currentUserId,
            rankChange: 0,
          };
        })
        .filter(Boolean),
      currentUserRank: currentUserRank || null,
    });
  }

  // ── All-time ranking ──────────────────────────────────────────────────────
  const users = await prisma.user.findMany({
    where: { totalEarned: { gt: 0 } },
    orderBy: { totalEarned: "desc" },
    take: 50,
    select: USER_SELECT,
  });

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
        score: u.totalEarned,
        cardCount: u._count.cards,
        isSubscribed: u.youtubeSync?.isSubscribed ?? false,
        ...parseYoutubeCounts(u.youtubeSync ?? null),
        isCurrentUser: u.id === currentUserId,
        rankChange: prev != null ? prev - (i + 1) : 0,
      };
    }),
    currentUserRank: currentUserRank || null,
  });
}
