import { myPacks } from "@/lib/player-packs-db";
import { shopRoute } from "@/lib/shop-api";

/** Your unopened player packs and the ones you opened lately. */
export async function GET() {
  return shopRoute((userId) => myPacks(userId));
}
