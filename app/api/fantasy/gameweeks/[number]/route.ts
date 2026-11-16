import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { fantasyRoute } from "@/lib/fantasy-api";
import { activeSeason, asPicks, entryForGameweek, FantasyError, toPlayerStats } from "@/lib/fantasy-db";
import { gameweekStatus, isChip, pointsBreakdown, scoreEntry, type FantasyPosition } from "@/lib/fantasy";

type Params = { params: Promise<{ number: string }> };

/**
 * A team's points for a gameweek that has kicked off (yours, or ?teamId= for anyone's — teams
 * stay hidden until the deadline). Live gameweeks score from the stats entered so far.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { number } = await params;
  return fantasyRoute(async (userId) => {
    const season = await activeSeason();
    if (!season) throw new FantasyError("Fantasy isn't open yet.", 404);

    const gameweeks = await prisma.fantasyGameweek.findMany({ where: { seasonId: season.id } });
    const gw = gameweeks.find((g) => g.number === Number(number));
    if (!gw) throw new FantasyError("Gameweek not found", 404);
    const status = gameweekStatus(gw);
    if (status === "upcoming") throw new FantasyError("Teams are hidden until the deadline.", 403);

    const teamId = req.nextUrl.searchParams.get("teamId");
    const team = teamId
      ? await prisma.fantasyTeam.findUnique({ where: { id: teamId }, include: { user: { select: { name: true } }, entries: true } })
      : userId
        ? await prisma.fantasyTeam.findUnique({
            where: { userId_seasonId: { userId, seasonId: season.id } },
            include: { user: { select: { name: true } }, entries: true },
          })
        : null;
    if (!team || team.seasonId !== season.id) throw new FantasyError("Team not found", 404);

    // This gameweek's entry, or the team carried into it.
    const found = entryForGameweek(gameweeks, team.entries, gw.number);
    const entry = found?.entry ?? null;
    const sameWeek = !!found?.saved;

    const [players, statRows, aggregate] = await Promise.all([
      prisma.fantasyPlayer.findMany({ where: { seasonId: season.id }, select: { id: true, position: true } }),
      prisma.fantasyPlayerStats.findMany({ where: { gameweekId: gw.id } }),
      status === "finished"
        ? prisma.fantasyEntry.aggregate({ where: { gameweekId: gw.id }, _avg: { points: true }, _max: { points: true } })
        : null,
    ]);
    const positions = new Map(players.map((p) => [p.id, p.position as FantasyPosition]));
    const stats = new Map(statRows.map((s) => [s.playerId, toPlayerStats(s)]));

    const picks = entry ? asPicks(entry.picks) : [];
    const chip = sameWeek && isChip(entry!.chip) ? entry!.chip : null;
    const transferCost = sameWeek ? entry!.transferCost : 0;
    const score = entry
      ? scoreEntry(
          { playerIds: picks.map((p) => p.playerId), captainId: entry.captainId, viceCaptainId: entry.viceCaptainId, chip, transferCost },
          positions, stats,
        )
      : null;

    return {
      gameweek: {
        number: gw.number, name: gw.name, deadline: gw.deadline.toISOString(), status,
        goalsFor: gw.goalsFor, goalsAgainst: gw.goalsAgainst,
      },
      team: { id: team.id, name: team.name, manager: team.user.name },
      entry: entry
        ? { picks, captainId: entry.captainId, viceCaptainId: entry.viceCaptainId, chip, transferCost, transfersMade: sameWeek ? entry.transfersMade : 0 }
        : null,
      score,
      gameweekRank: sameWeek ? entry!.gameweekRank : null,
      lines: Object.fromEntries(picks.map((p) => [p.playerId, pointsBreakdown(stats.get(p.playerId), positions.get(p.playerId) ?? "MID")])),
      average: aggregate?._avg.points != null ? Math.round(aggregate._avg.points) : null,
      highest: aggregate?._max.points ?? null,
    };
  });
}
