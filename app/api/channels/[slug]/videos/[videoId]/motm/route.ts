import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildSquad, isSquadCard, playerKey, rankStandings } from "@/lib/motm";

type Params = { params: Promise<{ slug: string; videoId: string }> };

async function findVideo(slug: string, videoId: string) {
  const channel = await prisma.channel.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!channel) return null;
  const video = await prisma.videoMeta.findUnique({
    where: { videoId_channelId: { videoId, channelId: channel.id } },
    select: { videoId: true, title: true, thumbnailUrl: true, publishedAt: true },
  });
  return video ? { channel, video } : null;
}

/**
 * Standings for a video. Candidates are the video's own squad plus every other team's
 * squad (crossover videos), flagged as guests.
 */
async function results(found: NonNullable<Awaited<ReturnType<typeof findVideo>>>, userId?: string) {
  const { channel, video } = found;
  const [cards, tally, mine] = await Promise.all([
    prisma.card.findMany({
      where: { kit: { endsWith: "Kit" }, channel: { isActive: true } },
      select: { id: true, channelId: true, name: true, kit: true, position: true, imageUrl: true, channel: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.motmVote.groupBy({
      by: ["playerChannelId", "playerName"],
      where: { videoId: video.videoId, channelId: channel.id },
      _count: { _all: true },
    }),
    userId
      ? prisma.motmVote.findUnique({ where: { userId_videoId: { userId, videoId: video.videoId } } })
      : null,
  ]);

  const teamNames = new Map(cards.map((c) => [c.channelId, c.channel.name]));
  const { standings, totalVotes } = rankStandings(
    buildSquad(cards),
    tally.map((t) => ({ playerChannelId: t.playerChannelId, playerName: t.playerName, votes: t._count._all })),
    channel.id,
  );
  const myKey = mine ? playerKey(mine.playerChannelId, mine.playerName) : null;

  return {
    video,
    team: channel.name,
    totalVotes,
    myVote: standings.find((s) => playerKey(s.channelId, s.name) === myKey)?.id ?? null,
    candidates: standings.map(({ id, name, position, imageUrl, channelId, votes, percent }) => ({
      id, name, position, imageUrl, votes, percent,
      team: teamNames.get(channelId) ?? "",
      isGuest: channelId !== channel.id,
    })),
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { slug, videoId } = await params;
  const found = await findVideo(slug, videoId);
  if (!found) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const session = await getServerSession(authOptions);
  return NextResponse.json(await results(found, session?.user?.id));
}

/** Cast or change your vote. Body: { playerId } — any of the player's squad card ids. */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { slug, videoId } = await params;
  const found = await findVideo(slug, videoId);
  if (!found) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { playerId?: unknown };
  const player = typeof body.playerId === "string"
    ? await prisma.card.findUnique({
        where: { id: body.playerId },
        select: { name: true, kit: true, channelId: true, channel: { select: { isActive: true } } },
      })
    : null;
  if (!player || !isSquadCard(player) || !player.channel.isActive) {
    return NextResponse.json({ error: "Pick a player from the squad" }, { status: 400 });
  }

  const vote = { playerName: player.name, playerChannelId: player.channelId };
  await prisma.motmVote.upsert({
    where: { userId_videoId: { userId, videoId } },
    create: { userId, videoId, channelId: found.channel.id, ...vote },
    update: vote,
  });

  return NextResponse.json(await results(found, userId));
}
