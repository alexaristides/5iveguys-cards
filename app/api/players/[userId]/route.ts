import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { cards: { orderBy: { obtainedAt: "desc" } } },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: user.id,
    name: user.name,
    image: user.image,
    totalEarned: user.totalEarned,
    cardCount: user.cards.length,
    ownedCardIds: user.cards.map((c) => c.cardId),
  });
}
