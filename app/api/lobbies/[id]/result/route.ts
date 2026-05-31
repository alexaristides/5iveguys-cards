import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pusher } from "@/lib/pusher";

interface ResultBody {
  forfeit?: boolean;
  winnerId?: string | null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const lobby = await prisma.lobby.findUnique({
    where: { id },
    include: { matchResult: true },
  });
  if (!lobby) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (lobby.status === "FINISHED") {
    // Idempotent — return the existing result
    return NextResponse.json({ matchResult: lobby.matchResult });
  }
  if (lobby.creatorId !== session.user.id && lobby.opponentId !== session.user.id) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  const body = await req.json() as ResultBody;

  // Determine winner: for forfeit, the calling player wins; otherwise use stored simulation result
  let winnerId: string | null = null;
  let scoreline = "0–0";

  if (body.forfeit) {
    winnerId = session.user.id;
    scoreline = "W–0 (forfeit)";
  } else if (lobby.matchResult) {
    // Already computed at squad submission time
    winnerId = lobby.matchResult.winnerId;
    scoreline = lobby.matchResult.scoreline;
  } else if (body.winnerId !== undefined) {
    winnerId = body.winnerId;
  }

  // Update lobby to FINISHED
  await prisma.lobby.update({ where: { id }, data: { status: "FINISHED" } });

  // Upsert matchResult in case it wasn't created yet (forfeit path)
  const existingResult = await prisma.matchResult.findUnique({ where: { lobbyId: id } });
  if (!existingResult && lobby.opponentId) {
    await prisma.matchResult.create({
      data: {
        lobbyId: id,
        player1Id: lobby.creatorId,
        player2Id: lobby.opponentId,
        winnerId,
        scoreline,
      },
    });
  } else if (existingResult && winnerId !== existingResult.winnerId) {
    await prisma.matchResult.update({ where: { lobbyId: id }, data: { winnerId } });
  }

  // Update PvP stats for both players
  if (lobby.opponentId) {
    const isDraw = winnerId === null;
    const player1Won = winnerId === lobby.creatorId;
    const player2Won = winnerId === lobby.opponentId;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: lobby.creatorId },
        data: {
          pvpWins:   { increment: player1Won ? 1 : 0 },
          pvpLosses: { increment: player2Won ? 1 : 0 },
          pvpDraws:  { increment: isDraw ? 1 : 0 },
        },
      }),
      prisma.user.update({
        where: { id: lobby.opponentId },
        data: {
          pvpWins:   { increment: player2Won ? 1 : 0 },
          pvpLosses: { increment: player1Won ? 1 : 0 },
          pvpDraws:  { increment: isDraw ? 1 : 0 },
        },
      }),
    ]);
  }

  const matchResult = await prisma.matchResult.findUnique({ where: { lobbyId: id } });

  await pusher.trigger(`presence-lobby-${id}`, "match:fulltime", { winnerId, scoreline });

  return NextResponse.json({ matchResult });
}
