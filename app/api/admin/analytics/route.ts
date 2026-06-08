import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

function checkAdmin(req: NextRequest) {
  return req.headers.get("x-admin-secret") === process.env.ADMIN_SECRET;
}

const DAY = 86_400_000;
function daysAgo(n: number) { return new Date(Date.now() - n * DAY); }

// Count distinct userIds in a table, optionally scoped to a channel.
// Uses findMany + distinct because groupBy doesn't support nested relation where clauses.
async function distinctUsers(
  model: "packOpen" | "userCard" | "videoWatch" | "footballMatch" | "youtubeSync" | "forumPost" | "cardVote" | "cardBattle",
  channelId?: string
): Promise<number> {
  switch (model) {
    case "packOpen":
      return prisma.packOpen
        .findMany({ where: channelId ? { channelId } : {}, select: { userId: true }, distinct: ["userId"] })
        .then((r) => r.length);
    case "userCard":
      return prisma.userCard
        .findMany({ where: channelId ? { channelId } : {}, select: { userId: true }, distinct: ["userId"] })
        .then((r) => r.length);
    case "videoWatch":
      return prisma.videoWatch
        .findMany({ where: channelId ? { channelId } : {}, select: { userId: true }, distinct: ["userId"] })
        .then((r) => r.length);
    case "footballMatch":
      return prisma.footballMatch
        .findMany({ where: channelId ? { channelId } : {}, select: { userId: true }, distinct: ["userId"] })
        .then((r) => r.length);
    case "youtubeSync":
      return prisma.youtubeSync
        .findMany({ where: channelId ? { channelId } : {}, select: { userId: true }, distinct: ["userId"] })
        .then((r) => r.length);
    case "forumPost":
      return prisma.forumPost
        .findMany({ where: channelId ? { channelId } : {}, select: { authorId: true }, distinct: ["authorId"] })
        .then((r) => r.length);
    case "cardVote":
      return prisma.cardVote
        .findMany({
          where: channelId ? { card: { channelId } } : {},
          select: { userId: true },
          distinct: ["userId"],
        })
        .then((r) => r.length);
    case "cardBattle":
      return prisma.cardBattle
        .findMany({
          where: channelId ? { channelId } : {},
          select: { challengerId: true },
          distinct: ["challengerId"],
        })
        .then((r) => r.length);
  }
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const channelSlug = url.searchParams.get("channelSlug") ?? "all";

  let channelId: string | undefined;
  if (channelSlug !== "all") {
    const ch = await prisma.channel.findUnique({ where: { slug: channelSlug }, select: { id: true } });
    if (!ch) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    channelId = ch.id;
  }

  const cw = channelId ? { channelId } : {};

  const [
    totalUsers,
    syncedUsers,
    packUsers,
    cardUsers,
    watchUsers,
    footballUsers,
    battleUsers,
    forumUsers,
    voteUsers,
    totalPackOpens,
    totalSyncs,
    totalWatches,
    totalMatches,
    totalBattles,
    totalPosts,
    totalReplies,
    totalVotes,
    packsByType,
    pointsByType,
    newLast7,
    newLast30,
    activeUsers30d,
  ] = await Promise.all([
    prisma.user.count(),
    distinctUsers("youtubeSync", channelId),
    distinctUsers("packOpen", channelId),
    distinctUsers("userCard", channelId),
    distinctUsers("videoWatch", channelId),
    distinctUsers("footballMatch", channelId),
    distinctUsers("cardBattle", channelId),
    distinctUsers("forumPost", channelId),
    distinctUsers("cardVote", channelId),
    prisma.packOpen.count({ where: cw }),
    prisma.youtubeSync.count({ where: cw }),
    prisma.videoWatch.count({ where: cw }),
    prisma.footballMatch.count({ where: cw }),
    prisma.cardBattle.count({ where: channelId ? { channelId } : {} }),
    prisma.forumPost.count({ where: channelId ? { channelId } : {} }),
    prisma.forumReply.count({ where: channelId ? { post: { channelId } } : {} }),
    prisma.cardVote.count({ where: channelId ? { card: { channelId } } : {} }),
    prisma.packOpen.groupBy({ by: ["packType"], where: cw, _count: { _all: true }, _sum: { pointCost: true } }),
    prisma.pointsEvent.groupBy({ by: ["type"], where: cw, _count: { _all: true }, _sum: { points: true } }),
    prisma.user.count({ where: { createdAt: { gte: daysAgo(7) } } }),
    prisma.user.count({ where: { createdAt: { gte: daysAgo(30) } } }),
    // Active users: anyone who earned points in the last 30 days
    prisma.pointsEvent
      .findMany({
        where: { ...cw, earnedAt: { gte: daysAgo(30) } },
        select: { userId: true },
        distinct: ["userId"],
      })
      .then((r) => r.length),
  ]);

  // 30-day daily series
  const since30 = daysAgo(30);
  type DayRow = { date: string; n: bigint };

  const [packRows, signupRows, syncRows] = await Promise.all([
    prisma.$queryRaw<DayRow[]>`
      SELECT DATE("openedAt")::text AS date, COUNT(*) AS n FROM "PackOpen"
      WHERE "openedAt" >= ${since30}
      ${channelId ? Prisma.sql`AND "channelId" = ${channelId}` : Prisma.empty}
      GROUP BY 1 ORDER BY 1
    `,
    prisma.$queryRaw<DayRow[]>`
      SELECT DATE("createdAt")::text AS date, COUNT(*) AS n FROM "User"
      WHERE "createdAt" >= ${since30}
      GROUP BY 1 ORDER BY 1
    `,
    prisma.$queryRaw<DayRow[]>`
      SELECT DATE("lastSynced")::text AS date, COUNT(*) AS n FROM "YoutubeSync"
      WHERE "lastSynced" >= ${since30}
      ${channelId ? Prisma.sql`AND "channelId" = ${channelId}` : Prisma.empty}
      GROUP BY 1 ORDER BY 1
    `,
  ]);

  // ── Games analytics (global — these games are not channel-scoped) ──────────
  const [
    draftTotal, draftLast7, draftLast30, draftChampions, draftAgg,
    draftByDifficulty, draftByPlacement, draftDaily,
    wcTotal, wcByStatus, wcChampions,
    footballTotal, footballByResult, footballPlayers,
    pvpLobbies, pvpFinished, pvpDecisive,
  ] = await Promise.all([
    prisma.draftEntry.count(),
    prisma.draftEntry.count({ where: { createdAt: { gte: daysAgo(7) } } }),
    prisma.draftEntry.count({ where: { createdAt: { gte: daysAgo(30) } } }),
    prisma.draftEntry.count({ where: { won: true } }),
    prisma.draftEntry.aggregate({ _avg: { teamRating: true }, _sum: { goalsFor: true } }),
    prisma.draftEntry.groupBy({ by: ["difficulty"], _count: { _all: true } }),
    prisma.draftEntry.groupBy({ by: ["placement"], _count: { _all: true } }),
    prisma.$queryRaw<{ date: string; n: bigint }[]>`
      SELECT DATE("createdAt")::text AS date, COUNT(*) AS n FROM "DraftEntry"
      WHERE "createdAt" >= ${since30} GROUP BY 1 ORDER BY 1
    `,
    prisma.worldCup.count(),
    prisma.worldCup.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.worldCup.count({ where: { placement: "Champions" } }),
    prisma.footballMatch.count(),
    prisma.footballMatch.groupBy({ by: ["result"], _count: { _all: true } }),
    prisma.footballMatch.findMany({ select: { userId: true }, distinct: ["userId"] }).then((r) => r.length),
    prisma.lobby.count(),
    prisma.matchResult.count(),
    prisma.matchResult.count({ where: { winnerId: { not: null } } }),
  ]);

  const PLACEMENT_ORDER = ["Champions", "Runners-up", "Semi-finals", "Quarter-finals", "Round of 16", "Group stage"];
  const draftPlacementMap = new Map(draftByPlacement.map((p) => [p.placement, p._count._all]));
  const footballResultMap = new Map(footballByResult.map((r) => [r.result, r._count._all]));
  const draftDailyMap = new Map(draftDaily.map((r) => [r.date, Number(r.n)]));

  const days = Array.from({ length: 30 }, (_, i) =>
    new Date(Date.now() - (29 - i) * DAY).toISOString().slice(0, 10)
  );
  const toMap = (rows: DayRow[]) => new Map(rows.map((r) => [r.date, Number(r.n)]));
  const packMap = toMap(packRows);
  const signupMap = toMap(signupRows);
  const syncMap = toMap(syncRows);

  return NextResponse.json({
    funnel: [
      { label: "Signed up",      count: totalUsers },
      { label: "Synced YouTube", count: syncedUsers },
      { label: "Opened a pack",  count: packUsers },
      { label: "Has cards",      count: cardUsers },
      { label: "Watched videos", count: watchUsers },
      { label: "Played football",count: footballUsers },
      { label: "Card battles",   count: battleUsers },
      { label: "Forum activity", count: forumUsers },
      { label: "Voted on cards", count: voteUsers },
    ],
    features: [
      { label: "Pack opens",      total: totalPackOpens, users: packUsers },
      { label: "YouTube syncs",   total: totalSyncs,     users: syncedUsers },
      { label: "Video watches",   total: totalWatches,   users: watchUsers },
      { label: "Football matches",total: totalMatches,   users: footballUsers },
      { label: "Card battles",    total: totalBattles,   users: battleUsers },
      { label: "Forum posts",     total: totalPosts,     users: forumUsers },
      { label: "Forum replies",   total: totalReplies,   users: 0 },
      { label: "Card votes",      total: totalVotes,     users: voteUsers },
    ],
    packs: packsByType.map((p) => ({
      type: p.packType,
      count: p._count._all,
      pointsSpent: p._sum.pointCost ?? 0,
    })),
    points: pointsByType.map((p) => ({
      type: p.type,
      count: p._count._all,
      total: p._sum.points ?? 0,
    })),
    signups: { last7: newLast7, last30: newLast30, allTime: totalUsers },
    activeUsers30d,
    daily: days.map((date) => ({
      date,
      packs: packMap.get(date) ?? 0,
      signups: signupMap.get(date) ?? 0,
      syncs: syncMap.get(date) ?? 0,
      drafts: draftDailyMap.get(date) ?? 0,
    })),
    games: {
      draft: {
        total: draftTotal,
        last7: draftLast7,
        last30: draftLast30,
        champions: draftChampions,
        winRate: draftTotal ? Math.round((draftChampions / draftTotal) * 100) : 0,
        avgRating: Math.round(draftAgg._avg.teamRating ?? 0),
        totalGoals: draftAgg._sum.goalsFor ?? 0,
        byDifficulty: ["easy", "normal", "hard"].map((d) => ({
          label: d,
          count: draftByDifficulty.find((x) => x.difficulty === d)?._count._all ?? 0,
        })),
        byPlacement: PLACEMENT_ORDER.map((p) => ({ label: p, count: draftPlacementMap.get(p) ?? 0 })),
      },
      worldCup: {
        total: wcTotal,
        active: wcByStatus.find((s) => s.status === "ACTIVE")?._count._all ?? 0,
        finished: wcByStatus.find((s) => s.status === "FINISHED")?._count._all ?? 0,
        abandoned: wcByStatus.find((s) => s.status === "ABANDONED")?._count._all ?? 0,
        champions: wcChampions,
      },
      football: {
        total: footballTotal,
        players: footballPlayers,
        wins: footballResultMap.get("win") ?? 0,
        draws: footballResultMap.get("draw") ?? 0,
        losses: footballResultMap.get("loss") ?? 0,
      },
      pvp: {
        lobbies: pvpLobbies,
        finished: pvpFinished,
        decisive: pvpDecisive,
        draws: pvpFinished - pvpDecisive,
      },
    },
  });
}
