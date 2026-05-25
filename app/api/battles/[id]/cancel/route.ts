import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const battle = await prisma.cardBattle.findUnique({ where: { id } });

    if (!battle) {
      return NextResponse.json({ error: "Battle not found" }, { status: 404 });
    }
    if (battle.challengerId !== session.user.id) {
      return NextResponse.json({ error: "Only the challenger can cancel this battle" }, { status: 403 });
    }
    if (battle.status !== "PENDING") {
      return NextResponse.json({ error: "Cannot cancel a battle that is no longer pending" }, { status: 400 });
    }

    const userId = session.user.id;
    const channelId = battle.channelId ?? null;

    // Refund the wager back to channel stats (or global fallback)
    const refundOp = channelId
      ? prisma.userChannelStats.upsert({
          where: { userId_channelId: { userId, channelId } },
          create: { userId, channelId, points: battle.wager, totalEarned: 0 },
          update: { points: { increment: battle.wager } },
        })
      : prisma.user.update({ where: { id: userId }, data: { points: { increment: battle.wager } } });

    await prisma.$transaction([
      prisma.cardBattle.update({ where: { id }, data: { status: "CANCELLED" } }),
      refundOp,
    ]);

    const remainingPoints = await getPoints(userId, channelId);

    return NextResponse.json({ refunded: battle.wager, remainingPoints });
  } catch (err) {
    console.error("[POST /api/battles/[id]/cancel]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function getPoints(userId: string, channelId: string | null): Promise<number> {
  if (channelId) {
    const stats = await prisma.userChannelStats.findUnique({
      where: { userId_channelId: { userId, channelId } },
      select: { points: true },
    });
    return stats?.points ?? 0;
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { points: true } });
  return user?.points ?? 0;
}
