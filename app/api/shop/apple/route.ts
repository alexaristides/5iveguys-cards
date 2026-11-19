import { NextRequest } from "next/server";
import { confirmApplePurchase } from "@/lib/player-packs-db";
import { shopRoute, str } from "@/lib/shop-api";

/**
 * Confirm an App Store purchase. Body: { purchaseToken } (StoreKit 2's signed transaction).
 * Answers in expo-iap's PurchaseConfirmation shape; the app finishes the transaction on
 * "entitled" or "ownership_conflict" and retries "verification_delayed" later.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return shopRoute(async (userId) => {
    const jws = str(body.purchaseToken);
    if (!jws) return { status: "invalid", reason: "No purchase token" };
    return confirmApplePurchase(userId, jws);
  });
}
