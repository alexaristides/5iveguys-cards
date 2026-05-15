import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { MatchResults } from "@/lib/battles";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;

  const battles = await prisma.cardBattle.findMany({
    where: {
      status: "RESOLVED",
      OR: [{ challengerId: userId }, { acceptorId: userId }],
    },
    include: {
      challenger: { select: { id: true, name: true, image: true } },
      acceptor:   { select: { id: true, name: true, image: true } },
    },
    orderBy: { resolvedAt: "desc" },
    take: 50,
  });

  const history = battles.map((b) => {
    const isChallenger = b.challengerId === userId;
    const opponent = isChallenger ? b.acceptor : b.challenger;
    const outcome =
      b.winnerId === null ? "tie" :
      b.winnerId === userId ? "win" : "loss";

    return {
      id: b.id,
      outcome,
      opponent: opponent
        ? { id: opponent.id, name: opponent.name, image: opponent.image }
        : null,
      wager: b.wager,
      pointsChange: outcome === "win" ? b.wager : outcome === "loss" ? -b.wager : 0,
      resolvedAt: b.resolvedAt,
      matchResults: b.matchResults as MatchResults | null,
      wasChallenger: isChallenger,
    };
  });

  const wins   = history.filter((b) => b.outcome === "win").length;
  const losses = history.filter((b) => b.outcome === "loss").length;
  const ties   = history.filter((b) => b.outcome === "tie").length;

  return NextResponse.json({ history, record: { wins, losses, ties } });
}
