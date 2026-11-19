import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ShopError } from "@/lib/player-packs-db";

/** Run a shop route for the signed-in user, turning ShopErrors into JSON errors. */
export async function shopRoute(run: (userId: string) => Promise<unknown>) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await run(userId));
  } catch (err) {
    if (err instanceof ShopError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
