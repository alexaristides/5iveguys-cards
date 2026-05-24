import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const ADMIN_SECRET = process.env.ADMIN_SECRET!;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userIds, points, reason } = await req.json() as {
    userIds: string[] | "all";
    points: number;
    reason?: string;
  };

  if (!points || typeof points !== "number") {
    return NextResponse.json({ error: "Invalid points value" }, { status: 400 });
  }

  let targetUserIds: string[];
  if (userIds === "all") {
    const users = await prisma.user.findMany({ select: { id: true } });
    targetUserIds = users.map((u) => u.id);
  } else if (Array.isArray(userIds) && userIds.length > 0) {
    targetUserIds = userIds;
  } else {
    return NextResponse.json({ error: "No users selected" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: { in: targetUserIds } },
      data: {
        points: { increment: points },
        ...(points > 0 ? { totalEarned: { increment: points } } : {}),
      },
    }),
    prisma.pointsEvent.createMany({
      data: targetUserIds.map((userId) => ({
        userId,
        type: reason?.trim() || "admin_grant",
        points,
      })),
    }),
  ]);

  return NextResponse.json({ granted: targetUserIds.length });
}
