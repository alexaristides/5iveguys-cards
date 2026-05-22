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
  const channel = channelSlug
    ? await prisma.channel.findUnique({ where: { slug: channelSlug } })
    : null;
  const channelId = channel?.id ?? null;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [newSubCount, weeklyEvents, topActive] = await Promise.all([
    prisma.youtubeSync.count({
      where: {
        subscribedAt: { gte: sevenDaysAgo },
        ...(channelId ? { channelId } : {}),
      },
    }),
    prisma.pointsEvent.findMany({
      where: {
        earnedAt: { gte: sevenDaysAgo },
        ...(channelId ? { channelId } : {}),
      },
      select: { earnedAt: true, type: true, videoCount: true, points: true },
    }),
    prisma.pointsEvent.groupBy({
      by: ["userId"],
      where: {
        earnedAt: { gte: sevenDaysAgo },
        ...(channelId ? { channelId } : {}),
      },
      _sum: { points: true },
      orderBy: { _sum: { points: "desc" } },
      take: 5,
    }),
  ]);

  const likesByDayMap: Record<string, number> = {};
  let totalLikesThisWeek = 0;
  for (const event of weeklyEvents) {
    if (event.type === "like" || event.type === "earlyLike") {
      const date = event.earnedAt.toISOString().slice(0, 10);
      likesByDayMap[date] = (likesByDayMap[date] ?? 0) + event.videoCount;
      totalLikesThisWeek += event.videoCount;
    }
  }
  const likesByDay = Object.entries(likesByDayMap)
    .map(([date, likeCount]) => ({ date, likeCount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const topUserIds = topActive.map((g) => g.userId);
  const topUserDetails = await prisma.user.findMany({
    where: { id: { in: topUserIds } },
    select: { id: true, name: true, image: true },
  });
  const userDetailMap = new Map(topUserDetails.map((u) => [u.id, u]));

  const mostActiveUsers = topActive.map((g) => ({
    userId: g.userId,
    name: userDetailMap.get(g.userId)?.name ?? null,
    image: userDetailMap.get(g.userId)?.image ?? null,
    pointsThisWeek: g._sum.points ?? 0,
  }));

  return NextResponse.json({
    newSubsThisWeek: newSubCount,
    totalLikesThisWeek,
    likesByDay,
    mostActiveUsers,
  });
}
