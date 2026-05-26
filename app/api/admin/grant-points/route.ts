import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const ADMIN_SECRET = process.env.ADMIN_SECRET!;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userIds, points, reason, channelSlug } = await req.json() as {
    userIds: string[] | "all";
    points: number;
    reason?: string;
    channelSlug: string;
  };

  if (!points || typeof points !== "number") {
    return NextResponse.json({ error: "Invalid points value" }, { status: 400 });
  }
  if (!channelSlug) {
    return NextResponse.json({ error: "channelSlug is required" }, { status: 400 });
  }

  const channel = await prisma.channel.findUnique({
    where: { slug: channelSlug },
    select: { id: true },
  });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }
  const channelId = channel.id;

  let targetUserIds: string[];
  if (userIds === "all") {
    const users = await prisma.user.findMany({ select: { id: true } });
    targetUserIds = users.map((u) => u.id);
  } else if (Array.isArray(userIds) && userIds.length > 0) {
    targetUserIds = userIds;
  } else {
    return NextResponse.json({ error: "No users selected" }, { status: 400 });
  }

  // Upsert UserChannelStats for each user + create PointsEvent records
  await prisma.$transaction([
    ...targetUserIds.map((userId) =>
      prisma.userChannelStats.upsert({
        where: { userId_channelId: { userId, channelId } },
        create: {
          userId,
          channelId,
          points,
          totalEarned: points > 0 ? points : 0,
        },
        update: {
          points: { increment: points },
          ...(points > 0 ? { totalEarned: { increment: points } } : {}),
        },
      })
    ),
    prisma.pointsEvent.createMany({
      data: targetUserIds.map((userId) => ({
        userId,
        channelId,
        type: reason?.trim() || "admin_grant",
        points,
        isFanPoint: false,
      })),
    }),
  ]);

  return NextResponse.json({ granted: targetUserIds.length, channelSlug });
}
