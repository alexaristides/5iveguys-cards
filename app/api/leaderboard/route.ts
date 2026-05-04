import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    where: { totalEarned: { gt: 0 } },
    orderBy: { totalEarned: "desc" },
    take: 50,
    select: {
      id: true,
      name: true,
      image: true,
      points: true,
      totalEarned: true,
      createdAt: true,
      _count: { select: { cards: true } },
      youtubeSync: {
        select: {
          isSubscribed: true,
          likedVideoIds: true,
          commentCount: true,
        },
      },
    },
  });

  const currentUserId = session.user.id;
  const currentUserRank = users.findIndex((u) => u.id === currentUserId) + 1;

  return NextResponse.json({
    leaderboard: users.map((u, i) => ({
      rank: i + 1,
      id: u.id,
      name: u.name,
      image: u.image,
      points: u.points,
      totalEarned: u.totalEarned,
      cardCount: u._count.cards,
      isSubscribed: u.youtubeSync?.isSubscribed ?? false,
      likedCount: u.youtubeSync ? JSON.parse(u.youtubeSync.likedVideoIds || "[]").length : 0,
      commentCount: u.youtubeSync?.commentCount ?? 0,
      isCurrentUser: u.id === currentUserId,
    })),
    currentUserRank: currentUserRank || null,
  });
}
