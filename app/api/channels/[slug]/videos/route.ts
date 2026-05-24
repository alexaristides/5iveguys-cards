import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 24;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const channel = await prisma.channel.findUnique({ where: { slug } });
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const q = searchParams.get("q")?.trim() ?? "";

  const where = {
    channelId: channel.id,
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [total, videos] = await Promise.all([
    prisma.videoMeta.count({ where }),
    prisma.videoMeta.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { videoId: true, title: true, thumbnailUrl: true, publishedAt: true },
    }),
  ]);

  // Mark which videos the current user has any credited watch time on
  const videoIds = videos.map((v) => v.videoId);
  const watched = videoIds.length
    ? await prisma.videoWatch.findMany({
        where: { userId: session.user.id, videoId: { in: videoIds } },
        select: { videoId: true },
      })
    : [];
  const watchedSet = new Set(watched.map((w) => w.videoId));

  const enriched = videos.map((v) => ({
    ...v,
    watchedByMe: watchedSet.has(v.videoId),
  }));

  return NextResponse.json({ videos: enriched, total, page, pageSize: PAGE_SIZE });
}
