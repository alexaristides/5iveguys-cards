import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { WORLD_SLUGS } from "@/lib/worlds";

export async function GET() {
  const channels = await prisma.channel.findMany({
    where: { isActive: true, slug: { in: WORLD_SLUGS } },
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

  channels.sort((a, b) => WORLD_SLUGS.indexOf(a.slug) - WORLD_SLUGS.indexOf(b.slug));

  return NextResponse.json({ channels });
}
