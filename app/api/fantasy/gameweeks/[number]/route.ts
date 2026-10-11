import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { activeSeason, asPicks, toPlayerStats } from "@/lib/fantasy-db";
import { gameweekStatus, pointsBreakdown, scoreEntry, type Chip, type FantasyPosition } from "@/lib/fantasy";

type Params = { params: Promise<{ number: string }> };

/**
 * A team's points for a locked gameweek (yours, or ?teamId= for anyone's — picks are only
 * visible once the deadline has passed). Live gameweeks score from the stats entered so far.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { number } = await params;
  const season = await activeSeason();
  if (!season) return NextResponse.json({ error: "Fantasy isn't open yet." }, { status: 404 });

  const gw = await prisma.fantasyGameweek.findUnique({ where: { seasonId_number: { seasonId: season.id, number: Number(number) } } });
  if (!gw) return NextResponse.json({ error: "Gameweek not found" }, { status: 404 });
  const status = gameweekStatus(gw);
  if (status === "upcoming") return NextResponse.json({ error: "Teams are hidden until the deadline." }, { status: 403 });

  const session = await getServerSession(authOptions);
  const teamId = req.nextUrl.searchParams.get("teamId");
  const team = teamId
    ? await prisma.fantasyTeam.findUnique({ where: { id: teamId }, include: { user: { select: { name: true } } } })
    : session?.user?.id
      ? await prisma.fantasyTeam.findUnique({
          where: { userId_seasonId: { userId: session.user.id, seasonId: season.id } },
          include: { user: { select: { name: true } } },
        })
      : null;
  if (!team || team.seasonId !== season.id) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  // This gameweek's entry, or the one the team carried over from an earlier week.
  const entry = await prisma.fantasyEntry.findFirst({
    where: { teamId: team.id, gameweek: { number: { lte: gw.number } } },
    orderBy: { gameweek: { number: "desc" } },
  });

  const [players, statRows, aggregate] = await Promise.all([
    prisma.fantasyPlayer.findMany({ where: { seasonId: season.id }, select: { id: true, position: true } }),
    prisma.fantasyPlayerStats.findMany({ where: { gameweekId: gw.id } }),
    status === "finished"
      ? prisma.fantasyEntry.aggregate({ where: { gameweekId: gw.id }, _avg: { points: true }, _max: { points: true } })
      : null,
  ]);
  const positions = new Map(players.map((p) => [p.id, p.position as FantasyPosition]));
  const stats = new Map(statRows.map((s) => [s.playerId, toPlayerStats(s)]));

  const sameWeek = entry?.gameweekId === gw.id;
  const picks = entry ? asPicks(entry.picks) : [];
  const chip = sameWeek ? (entry!.chip as Chip | null) : null;
  const transferCost = sameWeek ? entry!.transferCost : 0;
  const score = entry
    ? scoreEntry(
        { playerIds: picks.map((p) => p.playerId), captainId: entry.captainId, viceCaptainId: entry.viceCaptainId, chip, transferCost },
        positions, stats,
      )
    : null;

  return NextResponse.json({
    gameweek: { number: gw.number, name: gw.name, deadline: gw.deadline.toISOString(), status },
    team: { id: team.id, name: team.name, manager: team.user.name },
    entry: entry
      ? { picks, captainId: entry.captainId, viceCaptainId: entry.viceCaptainId, chip, transferCost, transfersMade: sameWeek ? entry.transfersMade : 0 }
      : null,
    score,
    lines: Object.fromEntries(picks.map((p) => [p.playerId, pointsBreakdown(stats.get(p.playerId), positions.get(p.playerId) ?? "MID")])),
    average: aggregate?._avg.points != null ? Math.round(aggregate._avg.points) : null,
    highest: aggregate?._max.points ?? null,
  });
}
