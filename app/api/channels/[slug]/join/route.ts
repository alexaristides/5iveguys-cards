import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const WELCOME_POINTS = 100;

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

  // Upsert UserChannelStats — grants welcome points only on first join
  const existing = await prisma.userChannelStats.findUnique({
    where: { userId_channelId: { userId: session.user.id, channelId: channel.id } },
  });

  if (!existing) {
    await prisma.userChannelStats.create({
      data: {
        userId: session.user.id,
        channelId: channel.id,
        points: WELCOME_POINTS,
        totalEarned: WELCOME_POINTS,
      },
    });
    return NextResponse.json({ joined: true, welcomePoints: WELCOME_POINTS });
  }

  return NextResponse.json({ joined: false });
}
