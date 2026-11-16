import { NextRequest } from "next/server";
import { fantasyRoute } from "@/lib/fantasy-api";
import { joinLeague } from "@/lib/fantasy-db";

/** Join a league with its code. Body: { code }. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  return fantasyRoute(async (userId) => {
    const league = await joinLeague(userId!, typeof body.code === "string" ? body.code : "");
    return { league: { id: league.id, name: league.name, code: league.code } };
  }, { auth: true });
}
