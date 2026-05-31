import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pusher } from "@/lib/pusher";
import seedrandom from "seedrandom";
import { simulateMatch, type Formation, type Position, type AssignedPlayer } from "@/lib/football";

interface SlotInput {
  position: Position;
  posIndex: number;
  cardId: string;
}

export interface SquadJson {
  formation: Formation;
  players: AssignedPlayer[];
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { formation: Formation; slots: SlotInput[] };

  if (!body.formation || !Array.isArray(body.slots) || body.slots.length !== 7) {
    return NextResponse.json({ error: "Exactly 7 players required" }, { status: 400 });
  }

  const lobby = await prisma.lobby.findUnique({ where: { id } });
  if (!lobby) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (lobby.status === "WAITING") return NextResponse.json({ error: "Waiting for opponent to join" }, { status: 400 });
  if (lobby.status === "FINISHED") return NextResponse.json({ error: "Match already finished" }, { status: 409 });

  const userId = session.user.id;
  const isCreator = lobby.creatorId === userId;
  const isOpponent = lobby.opponentId === userId;
  if (!isCreator && !isOpponent) return NextResponse.json({ error: "Not a participant" }, { status: 403 });

  // Validate no duplicates
  const cardIds = body.slots.map((s) => s.cardId);
  if (new Set(cardIds).size !== 7) return NextResponse.json({ error: "Duplicate cards not allowed" }, { status: 400 });

  // Verify ownership
  const owned = await prisma.userCard.findMany({ where: { userId, cardId: { in: cardIds } }, select: { cardId: true } });
  const ownedSet = new Set(owned.map((u) => u.cardId));
  if (cardIds.some((cid) => !ownedSet.has(cid))) return NextResponse.json({ error: "You don't own one or more cards" }, { status: 400 });

  // Fetch card details
  const cards = await prisma.card.findMany({
    where: { id: { in: cardIds } },
    select: { id: true, name: true, kit: true, rarity: true, imageUrl: true, attribute: true },
  });
  const cardMap = new Map(cards.map((c) => [c.id, c]));

  const players: AssignedPlayer[] = body.slots.map((slot) => {
    const c = cardMap.get(slot.cardId)!;
    return {
      card: {
        id: c.id, name: c.name,
        rarity: c.rarity as AssignedPlayer["card"]["rarity"],
        attribute: (c.attribute ?? "Skill") as AssignedPlayer["card"]["attribute"],
        imageUrl: c.imageUrl, kit: c.kit ?? null,
      },
      position: slot.position,
      posIndex: slot.posIndex,
    };
  });

  const squadJson: SquadJson = { formation: body.formation, players };
  const squadField = isCreator ? "creatorSquad" : "opponentSquad";

  const updatedLobby = await prisma.lobby.update({
    where: { id },
    data: { [squadField]: squadJson as object },
  });

  await pusher.trigger(`lobby-${id}`, "lobby:squad_locked", {
    player: isCreator ? "creator" : "opponent",
  });

  // Check if both squads are submitted
  const creatorSquad = (isCreator ? squadJson : updatedLobby.creatorSquad) as SquadJson | null;
  const opponentSquad = (isOpponent ? squadJson : updatedLobby.opponentSquad) as SquadJson | null;

  if (!creatorSquad || !opponentSquad) {
    return NextResponse.json({ status: "waiting" });
  }

  // Both ready — compute deterministic simulation and store it
  const rng = seedrandom(id);
  const simulation = simulateMatch(
    creatorSquad.players,
    opponentSquad.players,
    creatorSquad.formation,
    opponentSquad.formation,
    rng,
  );

  const scoreline = `${simulation.userScore}–${simulation.cpuScore}`;
  const winnerId =
    simulation.result === "win" ? lobby.creatorId :
    simulation.result === "loss" ? lobby.opponentId : null;

  await prisma.$transaction([
    prisma.matchResult.create({
      data: {
        lobbyId: id,
        player1Id: lobby.creatorId,
        player2Id: lobby.opponentId!,
        winnerId,
        scoreline,
        simulation: {
          simulation,
          creatorFormation: creatorSquad.formation,
          opponentFormation: opponentSquad.formation,
          creatorLineup: creatorSquad.players,
          opponentLineup: opponentSquad.players,
        } as object,
      },
    }),
  ]);

  // Signal match start — clients fetch the full lobby to get both squads, then run sim locally
  await pusher.trigger(`lobby-${id}`, "lobby:squad_locked", {
    player: "both",
    matchReady: true,
  });

  return NextResponse.json({ status: "match-ready" });
}
