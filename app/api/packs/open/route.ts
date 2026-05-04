import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PACKS, openPack } from "@/lib/cards";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { packId } = await req.json();
  const pack = PACKS.find((p) => p.id === packId);
  if (!pack) {
    return NextResponse.json({ error: "Invalid pack" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.points < pack.cost) {
    return NextResponse.json({ error: "Insufficient points" }, { status: 400 });
  }

  const cards = openPack(pack);
  const cardIds = cards.map((c) => c.id);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: session.user.id },
      data: { points: { decrement: pack.cost } },
    }),
    prisma.packOpen.create({
      data: {
        userId: session.user.id,
        packType: pack.id,
        cardIds: JSON.stringify(cardIds),
        pointCost: pack.cost,
      },
    }),
    ...cardIds.map((cardId) =>
      prisma.userCard.create({
        data: { userId: session.user.id, cardId },
      })
    ),
  ]);

  const updatedUser = await prisma.user.findUnique({ where: { id: session.user.id } });

  return NextResponse.json({ cards, remainingPoints: updatedUser?.points ?? 0 });
}
