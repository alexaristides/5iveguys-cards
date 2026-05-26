import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  const channels = await prisma.channel.findMany({
    where: {
      isActive: true,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    select: {
      id: true,
      slug: true,
      name: true,
      thumbnailUrl: true,
      description: true,
      rewardTags: true,
      _count: { select: { userStats: true } },
    },
    orderBy: { name: "asc" },
    take: 10,
  });

  return NextResponse.json({ channels });
}
