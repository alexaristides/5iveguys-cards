import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const userCards = await prisma.userCard.findMany({
    where: { userId },
    orderBy: { obtainedAt: "desc" },
    include: {
      channel: { select: { id: true, slug: true, name: true, thumbnailUrl: true } },
    },
  });

  const cardIds = userCards.map((uc) => uc.cardId);
  const cardData =
    cardIds.length > 0
      ? await prisma.card.findMany({
          where: { id: { in: cardIds } },
          select: { id: true, name: true, kit: true, rarity: true, imageUrl: true, backImageUrl: true, attribute: true, description: true, channelId: true, position: true },
        })
      : [];
  const cardDataMap = new Map(cardData.map((c) => [c.id, c]));

  const cards = userCards.map((uc) => ({
    id: uc.id,
    cardId: uc.cardId,
    channelId: uc.channelId,
    channel: uc.channel,
    isFavorite: uc.isFavorite,
    obtainedAt: uc.obtainedAt,
    card: cardDataMap.get(uc.cardId) ?? null,
  }));

  return NextResponse.json({ cards });
}
