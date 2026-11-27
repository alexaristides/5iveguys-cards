import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { activeSeason } from "@/lib/fantasy-db";
import { squadRatings } from "@/lib/player-ratings";

/**
 * The team's squad, one entry per player, with the fans' overall rating, whether you've rated
 * them, and their fantasy player id. Rate a player with POST /api/cards/{cardId}/votes.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const channel = await prisma.channel.findUnique({ where: { slug }, select: { id: true } });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [session, cards, season] = await Promise.all([
    getServerSession(authOptions),
    prisma.card.findMany({
      where: { channelId: channel.id, kit: { endsWith: "Kit" } },
      select: { id: true, channelId: true, name: true, kit: true, position: true, imageUrl: true },
      orderBy: { createdAt: "asc" },
    }),
    activeSeason(),
  ]);

  const [votes, fantasyPlayers] = await Promise.all([
    prisma.cardVote.findMany({
      where: { cardId: { in: cards.map((c) => c.id) } },
      select: {
        cardId: true, userId: true, attack: true, defense: true, speed: true, strength: true, skillMoves: true,
        iq: true, aura: true, goalkeeping: true, agility: true, celebration: true, clutch: true,
      },
    }),
    season
      ? prisma.fantasyPlayer.findMany({ where: { seasonId: season.id }, select: { id: true, name: true } })
      : [],
  ]);

  return NextResponse.json({
    players: squadRatings(cards, votes, session?.user?.id ?? null, fantasyPlayers),
  });
}
