import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const ADMIN_SECRET = process.env.ADMIN_SECRET!;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [scanStatus, totalAuthors, aggregate] = await Promise.all([
    prisma.channelScanStatus.findUnique({ where: { id: "singleton" } }),
    prisma.channelCommentCache.count(),
    prisma.channelCommentCache.aggregate({ _sum: { commentCount: true }, _avg: { commentCount: true } }),
  ]);

  return NextResponse.json({
    lastScanned: scanStatus?.lastScanned ?? null,
    videoCount: scanStatus?.videoCount ?? 0,
    totalAuthors,
    totalComments: aggregate._sum.commentCount ?? 0,
    avgCommentsPerUser: Math.round((aggregate._avg.commentCount ?? 0) * 10) / 10,
  });
}
