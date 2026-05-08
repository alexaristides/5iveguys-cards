import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PACKS, openPack, DUPLICATE_REFUND, CardResult } from "@/lib/cards";

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

  const drawnCards = openPack(pack);
  const drawnCardIds = drawnCards.map((c) => c.id);

  const owned = await prisma.userCard.findMany({
    where: { userId: session.user.id, cardId: { in: drawnCardIds } },
    select: { cardId: true },
  });
  const ownedSet = new Set(owned.map((c) => c.cardId));

  const seenInPack = new Set<string>();
  const cardResults: CardResult[] = [];
  let totalRefund = 0;

  for (const card of drawnCards) {
    const isDuplicate = ownedSet.has(card.id) || seenInPack.has(card.id);
    const refundPoints = isDuplicate ? DUPLICATE_REFUND[card.rarity] : 0;
    if (!isDuplicate) seenInPack.add(card.id);
    totalRefund += refundPoints;
    cardResults.push({ ...card, isDuplicate, refundPoints });
  }

  const newCardIds = cardResults.filter((c) => !c.isDuplicate).map((c) => c.id);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: session.user.id },
      data: { points: { decrement: pack.cost - totalRefund } },
    }),
    prisma.packOpen.create({
      data: {
        userId: session.user.id,
        packType: pack.id,
        cardIds: JSON.stringify(drawnCardIds),
        pointCost: pack.cost,
      },
    }),
    ...newCardIds.map((cardId) =>
      prisma.userCard.create({
        data: { userId: session.user.id, cardId },
      })
    ),
  ]);

  const updatedUser = await prisma.user.findUnique({ where: { id: session.user.id } });

  return NextResponse.json({
    cards: cardResults,
    remainingPoints: updatedUser?.points ?? 0,
    totalRefund,
    duplicateCount: cardResults.filter((c) => c.isDuplicate).length,
  });
}
