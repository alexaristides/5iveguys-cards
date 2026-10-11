import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { activeSeason } from "@/lib/fantasy-db";

/** Season standings: top teams by total points, plus your own position. */
export async function GET(req: NextRequest) {
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 50));
  const season = await activeSeason();
  if (!season) return NextResponse.json({ teams: [], me: null, teamCount: 0, lastGameweek: null });

  const lastGameweek = await prisma.fantasyGameweek.findFirst({
    where: { seasonId: season.id, finalizedAt: { not: null } },
    orderBy: { number: "desc" },
    select: { id: true, number: true },
  });
  const select = {
    id: true, name: true, totalPoints: true, userId: true,
    user: { select: { name: true, image: true } },
    entries: lastGameweek ? { where: { gameweekId: lastGameweek.id }, select: { points: true } } : false,
  } as const;

  const session = await getServerSession(authOptions);
  const [top, teamCount, mine] = await Promise.all([
    prisma.fantasyTeam.findMany({ where: { seasonId: season.id }, orderBy: [{ totalPoints: "desc" }, { createdAt: "asc" }], take: limit, select }),
    prisma.fantasyTeam.count({ where: { seasonId: season.id } }),
    session?.user?.id
      ? prisma.fantasyTeam.findUnique({ where: { userId_seasonId: { userId: session.user.id, seasonId: season.id } }, select })
      : null,
  ]);

  type Row = (typeof top)[number];
  const shape = (t: Row, rank: number) => ({
    rank,
    id: t.id,
    name: t.name,
    manager: t.user.name,
    image: t.user.image,
    totalPoints: t.totalPoints,
    lastPoints: Array.isArray(t.entries) ? (t.entries[0]?.points ?? null) : null,
  });

  // Tied teams share a rank.
  const teams = top.map((t) => shape(t, 1 + top.filter((o) => o.totalPoints > t.totalPoints).length));
  const me = mine
    ? shape(mine, 1 + await prisma.fantasyTeam.count({ where: { seasonId: season.id, totalPoints: { gt: mine.totalPoints } } }))
    : null;

  return NextResponse.json({ teams, me, teamCount, lastGameweek: lastGameweek?.number ?? null });
}
