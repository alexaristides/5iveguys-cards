import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const channels = await prisma.channel.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      thumbnailUrl: true,
      youtubeChannelId: true,
      _count: { select: { userStats: true, cards: true } },
    },
  });

  return NextResponse.json({ channels });
}
