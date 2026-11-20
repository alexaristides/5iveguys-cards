import { NextRequest } from "next/server";
import { fantasyRoute } from "@/lib/fantasy-api";
import { overview, saveEntry } from "@/lib/fantasy-db";
import type { Chip, FantasyPosition } from "@/lib/fantasy";

/**
 * Save your team for the next gameweek (creates it on first save).
 * Body: { gameweek, playerIds (the 7), positions? (where each plays, same order), captainId, viceCaptainId, chip, name? }
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const playerIds = Array.isArray(body.playerIds) ? body.playerIds.filter((id): id is string => typeof id === "string") : [];
  return fantasyRoute(async (userId) => {
    await saveEntry(userId!, {
      gameweek: Number(body.gameweek),
      playerIds,
      // Older apps don't send positions: everyone plays their own. entryError checks the values.
      positions: Array.isArray(body.positions) ? (body.positions.map(String) as FantasyPosition[]) : undefined,
      captainId: String(body.captainId ?? ""),
      viceCaptainId: String(body.viceCaptainId ?? ""),
      // entryError rejects anything that isn't a chip.
      chip: typeof body.chip === "string" ? (body.chip as Chip) : null,
      name: typeof body.name === "string" ? body.name : undefined,
    });
    return overview(userId);
  }, { auth: true });
}
