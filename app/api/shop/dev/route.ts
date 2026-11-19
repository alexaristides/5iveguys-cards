import { NextRequest } from "next/server";
import { devPurchase } from "@/lib/player-packs-db";
import { shopRoute, str } from "@/lib/shop-api";

/** Local dev only (`next dev` with SHOP_DEV_PURCHASES=1): pay for an order without the App Store. Body: { orderId }. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return shopRoute((userId) => devPurchase(userId, str(body.orderId)));
}
