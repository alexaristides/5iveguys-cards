import { NextResponse } from "next/server";
import { fantasyStats } from "@/lib/fantasy-db";

// Live numbers: never built into a static file at build time.
export const dynamic = "force-dynamic";

/** The season's stats for everyone: picks, transfers and each player's tallies (lib/fantasy-stats.ts). */
export async function GET() {
  return NextResponse.json(await fantasyStats());
}
