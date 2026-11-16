import { NextRequest } from "next/server";
import { fantasyRoute } from "@/lib/fantasy-api";
import { createLeague, myLeagues } from "@/lib/fantasy-db";

/** Your private leagues, with your rank in each. */
export async function GET() {
  return fantasyRoute((userId) => myLeagues(userId!), { auth: true });
}

/** Start a league. Body: { name }. Returns the league with its invite code. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  return fantasyRoute(async (userId) => {
    const league = await createLeague(userId!, typeof body.name === "string" ? body.name : "");
    return { league: { id: league.id, name: league.name, code: league.code } };
  }, { auth: true });
}
