import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  await prisma.$transaction([
    prisma.cardBattle.update({ where: { id }, data: { status: "CANCELLED" } }),
    prisma.user.update({
      where: { id: session.user.id },
      data: { points: { increment: battle.wager } },
    }),
  ]);

  const updatedUser = await prisma.user.findUnique({ where: { id: session.user.id } });

  return NextResponse.json({ refunded: battle.wager, remainingPoints: updatedUser?.points ?? 0 });
}
