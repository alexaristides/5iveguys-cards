import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { FantasyError, overview, saveEntry } from "@/lib/fantasy-db";
import type { Chip } from "@/lib/fantasy";

/**
 * Save your team for the next gameweek (creates it on first save).
 * Body: { gameweek, playerIds (7 starters then 2 subs), captainId, viceCaptainId, chip, name? }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const playerIds = Array.isArray(body.playerIds) ? body.playerIds.filter((id): id is string => typeof id === "string") : [];
  try {
    await saveEntry(session.user.id, {
      gameweek: Number(body.gameweek),
      playerIds,
      captainId: String(body.captainId ?? ""),
      viceCaptainId: String(body.viceCaptainId ?? ""),
      chip: typeof body.chip === "string" ? (body.chip as Chip) : null,
      name: typeof body.name === "string" ? body.name : undefined,
    });
  } catch (err) {
    if (err instanceof FantasyError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  return NextResponse.json(await overview(session.user.id));
}
