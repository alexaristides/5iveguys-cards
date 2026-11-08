import { NextRequest } from "next/server";
import { fantasyRoute } from "@/lib/fantasy-api";
import { leagueStandings, leaveLeague } from "@/lib/fantasy-db";

type Params = { params: Promise<{ id: string }> };

/** A league's table. */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  return fantasyRoute((userId) => leagueStandings(id, userId), { auth: true });
}

/** Leave a league (the last one out deletes it). */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  return fantasyRoute(async (userId) => {
    await leaveLeague(userId!, id);
    return { ok: true };
  }, { auth: true });
}
