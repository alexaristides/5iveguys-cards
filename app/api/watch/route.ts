import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POINTS_CONFIG } from "@/lib/cards";

// Called from frontend when user watches embedded videos
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { minutes } = await req.json();
  if (typeof minutes !== "number" || minutes <= 0 || minutes > 60) {
    return NextResponse.json({ error: "Invalid minutes" }, { status: 400 });
  }

  const roundedMinutes = Math.floor(minutes);
  const pointsToAdd = roundedMinutes * POINTS_CONFIG.watchMinute;

  await prisma.$transaction([
    prisma.youtubeSync.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, watchMinutes: roundedMinutes },
      update: { watchMinutes: { increment: roundedMinutes } },
    }),
    prisma.user.update({
      where: { id: session.user.id },
      data: {
        points: { increment: pointsToAdd },
        totalEarned: { increment: pointsToAdd },
      },
    }),
  ]);

  return NextResponse.json({ pointsEarned: pointsToAdd });
}
