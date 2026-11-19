import { NextRequest, NextResponse } from "next/server";
import { shop, ShopError } from "@/lib/player-packs-db";

/** The player packs on sale in one team (?channelSlug=), with their odds. Public. */
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(await shop(req.nextUrl.searchParams.get("channelSlug") ?? ""));
  } catch (err) {
    if (err instanceof ShopError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
