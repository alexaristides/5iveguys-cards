import { NextRequest } from "next/server";
import { createOrder } from "@/lib/player-packs-db";
import { shopRoute, str } from "@/lib/shop-api";

/** Start buying a player's pack. Body: { channelSlug, playerName }. Returns the order id the App Store purchase carries. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return shopRoute((userId) => createOrder(userId, str(body.channelSlug), str(body.playerName)));
}
