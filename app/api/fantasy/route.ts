import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { overview } from "@/lib/fantasy-db";

/** The fantasy season, its players and gameweeks, and the signed-in fan's team. */
export async function GET() {
  const session = await getServerSession(authOptions);
  return NextResponse.json(await overview(session?.user?.id));
}
