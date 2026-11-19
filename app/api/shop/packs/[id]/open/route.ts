import { NextRequest } from "next/server";
import { openPack } from "@/lib/player-packs-db";
import { shopRoute, str } from "@/lib/shop-api";

/** Open one of your paid packs. Body (only for a pack without a player): { channelSlug, playerName }. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const choice = str(body.playerName) ? { channelSlug: str(body.channelSlug), playerName: str(body.playerName) } : undefined;
  return shopRoute((userId) => openPack(userId, id, choice));
}
