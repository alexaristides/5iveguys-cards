import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POINTS_CONFIG } from "@/lib/cards";

const MAX_SECONDS_PER_VIDEO = 60 * 180; // 180-minute cap per video

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; videoId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug, videoId } = await params;
  const userId = session.user.id;

  // Validate body
  const body = await req.json().catch(() => ({})) as { seconds?: number };
  const seconds = typeof body.seconds === "number" ? Math.floor(body.seconds) : 0;
  if (seconds < 1 || seconds > 120) {
    return NextResponse.json({ error: "seconds must be 1–120" }, { status: 400 });
  }

  // Resolve channel
  const channel = await prisma.channel.findUnique({ where: { slug } });
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  // Verify the video belongs to this channel
  const videoMeta = await prisma.videoMeta.findUnique({
    where: { videoId_channelId: { videoId, channelId: channel.id } },
  });
  if (!videoMeta) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  // Upsert VideoWatch to get current credited seconds
  const existing = await prisma.videoWatch.findUnique({
    where: { userId_videoId: { userId, videoId } },
  });
  const alreadyAwarded = existing?.secondsAwarded ?? 0;
  const creditable = Math.min(seconds, MAX_SECONDS_PER_VIDEO - alreadyAwarded);

  if (creditable <= 0) {
    return NextResponse.json({ pointsEarned: 0, cappedOut: true });
  }

  const minutesEarned = Math.floor(creditable / 60);
  const pointsEarned = minutesEarned * POINTS_CONFIG.watchMinute;

  // Transaction: update VideoWatch + stats + optionally PointsEvent
  await prisma.$transaction(async (tx) => {
    // Upsert VideoWatch
    await tx.videoWatch.upsert({
      where: { userId_videoId: { userId, videoId } },
      create: { userId, videoId, channelId: channel.id, secondsAwarded: creditable },
      update: { secondsAwarded: { increment: creditable } },
    });

    // Always update watchTimeSeconds (even for sub-minute segments)
    await tx.userChannelStats.upsert({
      where: { userId_channelId: { userId, channelId: channel.id } },
      create: {
        userId,
        channelId: channel.id,
        points: pointsEarned,
        totalEarned: pointsEarned,
        watchTimeSeconds: creditable,
      },
      update: {
        watchTimeSeconds: { increment: creditable },
        ...(pointsEarned > 0
          ? { points: { increment: pointsEarned }, totalEarned: { increment: pointsEarned } }
          : {}),
      },
    });

    if (pointsEarned > 0) {
      await tx.pointsEvent.create({
        data: { userId, channelId: channel.id, type: "watch", points: pointsEarned, videoCount: 1 },
      });
    }
  });

  const stats = await prisma.userChannelStats.findUnique({
    where: { userId_channelId: { userId, channelId: channel.id } },
  });

  return NextResponse.json({
    pointsEarned,
    cappedOut: false,
    watchTimeSeconds: stats?.watchTimeSeconds ?? creditable,
  });
}
