import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ cardId: string }> };

const PERIOD_DAYS: Record<string, number> = {
  "7d": 7, "30d": 30, "90d": 90,
};

export async function GET(req: NextRequest, { params }: Params) {
  const { cardId } = await params;
  const period = req.nextUrl.searchParams.get("period") ?? "30d";
  const days = PERIOD_DAYS[period] ?? 30;

  type HistoryRow = { day: string; overall: number; voteCount: number };
  const rows = await prisma.$queryRaw<HistoryRow[]>`
    SELECT DISTINCT ON (DATE("snapshotAt"))
      DATE("snapshotAt")::text AS day,
      overall,
      "voteCount"
    FROM "CardRatingSnapshot"
    WHERE "cardId" = ${cardId}
      AND "snapshotAt" >= NOW() - (${days} || ' days')::interval
    ORDER BY DATE("snapshotAt") ASC, "snapshotAt" DESC
  `;

  return NextResponse.json({ history: rows.map((r) => ({ day: r.day, overall: Math.round(r.overall), voteCount: r.voteCount })) });
}
