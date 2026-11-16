import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { FantasyError } from "@/lib/fantasy-db";

/** Run a fantasy route handler, turning FantasyErrors into JSON errors. */
export async function fantasyRoute(run: (userId: string | undefined) => Promise<unknown>, opts: { auth?: boolean } = {}) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (opts.auth && !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await run(userId));
  } catch (err) {
    if (err instanceof FantasyError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
