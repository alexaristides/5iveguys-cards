import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const ADMIN_SECRET = process.env.ADMIN_SECRET!;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [userCount, syncCount, syncs] = await Promise.all([
    prisma.user.count(),
    prisma.youtubeSync.count(),
    prisma.youtubeSync.findMany({
      select: { likedVideoIds: true, earlyLikedVideoIds: true },
    }),
  ]);

  let totalLikes = 0;
  let totalEarlyLikes = 0;
  for (const s of syncs) {
    totalLikes += (JSON.parse(s.likedVideoIds || "[]") as string[]).length;
    totalEarlyLikes += (JSON.parse(s.earlyLikedVideoIds || "[]") as string[]).length;
  }

  return NextResponse.json({
    userCount,
    syncCount,
    totalLikes,
    totalEarlyLikes,
  });
}
