import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pusher } from "@/lib/pusher";
import { assignPositions, type Formation, type AssignedPlayer } from "@/lib/football";
import { simulateFirstHalf, simulateSecondHalf } from "@/lib/match-engine";

interface StoredAtLock {
  creatorFormation: Formation;
  opponentFormation: Formation;
  creatorLineup: AssignedPlayer[];
  opponentLineup: AssignedPlayer[];
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { formation } = (await req.json()) as { formation: Formation };

  const lobby = await prisma.lobby.findUnique({ where: { id }, include: { matchResult: true } });
  if (!lobby) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const userId = session.user.id;
  const isCreator = lobby.creatorId === userId;
  const isOpponent = lobby.opponentId === userId;
  if (!isCreator && !isOpponent) return NextResponse.json({ error: "Not a participant" }, { status: 403 });

  // Record this player's 2nd-half formation.
  const field = isCreator ? "creatorFormation2" : "opponentFormation2";
  const updated = await prisma.lobby.update({ where: { id }, data: { [field]: formation } });
  const cF2 = updated.creatorFormation2 as Formation | null;
  const oF2 = updated.opponentFormation2 as Formation | null;

  if (!cF2 || !oF2) {
    await pusher.trigger(`presence-lobby-${id}`, "lobby:halftime-waiting", { who: isCreator ? "creator" : "opponent" });
    return NextResponse.json({ status: "waiting" });
  }

  // Both in → compute the authoritative full result and store it.
  const stored = lobby.matchResult?.simulation as unknown as StoredAtLock | null;
  if (!stored) return NextResponse.json({ error: "Squads not locked" }, { status: 409 });

  const h1 = simulateFirstHalf({
    userLineup: stored.creatorLineup,
    cpuLineup: stored.opponentLineup,
    userFormation: stored.creatorFormation,
    cpuFormation: stored.opponentFormation,
    seed: id,
  });
  const { summary } = simulateSecondHalf({
    userLineup: assignPositions(stored.creatorLineup.map((p) => p.card), cF2),
    cpuLineup: assignPositions(stored.opponentLineup.map((p) => p.card), oF2),
    userFormation: cF2,
    cpuFormation: oF2,
    seed: id,
    halftimeScore: h1.endScore,
    involvements: new Map(h1.involvements),
    firstHalfEvents: h1.events,
  });

  const scoreline = `${summary.userScore}–${summary.cpuScore}`;
  const winnerId = summary.result === "win" ? lobby.creatorId : summary.result === "loss" ? lobby.opponentId : null;

  await prisma.matchResult.update({
    where: { lobbyId: id },
    data: {
      winnerId,
      scoreline,
      simulation: { ...stored, creatorFormation2: cF2, opponentFormation2: oF2, summary } as object,
    },
  });

  await pusher.trigger(`presence-lobby-${id}`, "match:half2-ready", { creatorFormation2: cF2, opponentFormation2: oF2 });
  return NextResponse.json({ status: "ready" });
}
