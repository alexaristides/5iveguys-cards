import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const DAILY_REWARD_POINTS = 50;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const channel = await prisma.channel.findUnique({ where: { slug } });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stats = await prisma.userChannelStats.findUnique({
    where: { userId_channelId: { userId: session.user.id, channelId: channel.id } },
  });
  if (!stats) return NextResponse.json({ error: "Not a member of this channel" }, { status: 400 });

  const now = new Date();
  const lastClaim = stats.lastDailyReward;
  const eligible = !lastClaim || now.getTime() - lastClaim.getTime() >= COOLDOWN_MS;

  if (!eligible) {
    const nextClaimAt = new Date(lastClaim!.getTime() + COOLDOWN_MS);
    return NextResponse.json({ claimed: false, nextClaimAt: nextClaimAt.toISOString() });
  }

  await prisma.$transaction([
    prisma.userChannelStats.update({
      where: { userId_channelId: { userId: session.user.id, channelId: channel.id } },
      data: {
        points: { increment: DAILY_REWARD_POINTS },
        totalEarned: { increment: DAILY_REWARD_POINTS },
        fanTotalEarned: { increment: DAILY_REWARD_POINTS },
        lastDailyReward: now,
      },
    }),
    prisma.pointsEvent.create({
      data: {
        userId: session.user.id,
        channelId: channel.id,
        type: "dailyReward",
        points: DAILY_REWARD_POINTS,
        videoCount: 0,
        isFanPoint: true,
      },
    }),
  ]);

  return NextResponse.json({ claimed: true, pointsEarned: DAILY_REWARD_POINTS });
}
