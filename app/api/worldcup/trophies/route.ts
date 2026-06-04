import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { TournamentState } from "@/lib/worldcup/types";

// GET — the user's finished tournaments (trophy cabinet).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const finished = await prisma.worldCup.findMany({
    where: { userId: session.user.id, status: "FINISHED" },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });

  const trophies = finished.map((wc) => {
    const state = wc.state as unknown as TournamentState;
    const champ = state.entrants.find((e) => e.id === wc.champion);
    return {
      id: wc.id,
      placement: wc.placement,
      championName: champ?.name ?? "—",
      championFlag: champ?.flagUrl ?? null,
      wonByUser: wc.champion === state.userId,
      difficulty: wc.difficulty,
      date: wc.updatedAt,
    };
  });
  return NextResponse.json({ trophies });
}
