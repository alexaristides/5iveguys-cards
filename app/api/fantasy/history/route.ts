import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { fantasyRoute } from "@/lib/fantasy-api";
import { activeSeason, FantasyError, teamHistory } from "@/lib/fantasy-db";

/** A team's gameweek-by-gameweek history: yours, or ?teamId= for anyone's. */
export async function GET(req: NextRequest) {
  return fantasyRoute(async (userId) => {
    let teamId = req.nextUrl.searchParams.get("teamId");
    if (!teamId) {
      const season = await activeSeason();
      const team = season && userId
        ? await prisma.fantasyTeam.findUnique({ where: { userId_seasonId: { userId, seasonId: season.id } }, select: { id: true } })
        : null;
      if (!team) throw new FantasyError("You haven't picked a team yet.", 404);
      teamId = team.id;
    }
    return teamHistory(teamId);
  });
}
