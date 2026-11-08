import { NextRequest } from "next/server";
import { fantasyRoute } from "@/lib/fantasy-api";
import { playerDetail } from "@/lib/fantasy-db";

/** One player's price, availability and points gameweek by gameweek. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return fantasyRoute(() => playerDetail(id));
}
