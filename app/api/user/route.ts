import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      cards: { orderBy: { obtainedAt: "desc" } },
      youtubeSync: true,
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    points: user.points,
    totalEarned: user.totalEarned,
    cardCount: user.cards.length,
    cards: user.cards,
    youtubeSync: user.youtubeSync,
  });
}
