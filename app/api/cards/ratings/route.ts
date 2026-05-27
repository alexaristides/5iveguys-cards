import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const STAT_FIELDS = [
  "attack", "defense", "speed", "strength", "skillMoves",
  "iq", "aura", "goalkeeping", "agility", "celebration", "clutch",
] as const;

const PERIOD_MS: Record<string, number> = {
  "1d":  1  * 24 * 60 * 60 * 1000,
  "7d":  7  * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export async function GET(req: NextRequest) {
  const sort        = req.nextUrl.searchParams.get("sort")        ?? "top";
  const channelSlug = req.nextUrl.searchParams.get("channelSlug") ?? null;
  const rarity      = req.nextUrl.searchParams.get("rarity")      ?? null;
  const period      = req.nextUrl.searchParams.get("period")      ?? "7d";

  const validRarities = ["common", "rare", "epic", "legendary"];

  // Resolve slug → DB channel id
  let channelId: string | null = null;
  if (channelSlug) {
    const ch = await prisma.channel.findUnique({ where: { slug: channelSlug }, select: { id: true } });
    channelId = ch?.id ?? null;
  }

  // ── 1. Fetch cards with all votes ───────────────────────────────────────────
  const cards = await prisma.card.findMany({
    where: {
      ...(channelId ? { channelId } : {}),
      ...(rarity && validRarities.includes(rarity) ? { rarity: rarity as "common" | "rare" | "epic" | "legendary" } : {}),
    },
    select: {
      id: true, name: true, kit: true, rarity: true, imageUrl: true,
      channel: { select: { id: true, name: true, slug: true, thumbnailUrl: true } },
      votes: { select: STAT_FIELDS.reduce((acc, f) => ({ ...acc, [f]: true }), {} as Record<typeof STAT_FIELDS[number], true>) },
    },
  });

  // ── 2. Compute current overall for each card (skip unvoted cards) ───────────
  type CardEntry = {
    id: string; name: string; kit: string | null; rarity: string;
    imageUrl: string; channel: { id: string; name: string; slug: string; thumbnailUrl: string | null };
    overall: number; voteCount: number;
  };

  const cardsWithOverall: CardEntry[] = [];
  for (const card of cards) {
    const voteCount = card.votes.length;
    if (voteCount === 0) continue;
    const total = card.votes.reduce((sum, v) =>
      sum + STAT_FIELDS.reduce((s, f) => s + (v[f] as number), 0), 0);
    cardsWithOverall.push({
      id: card.id, name: card.name, kit: card.kit, rarity: card.rarity,
      imageUrl: card.imageUrl, channel: card.channel,
      overall: Math.round(total / (voteCount * STAT_FIELDS.length)),
      voteCount,
    });
  }

  if (cardsWithOverall.length === 0) {
    return NextResponse.json({ cards: [] });
  }

  const cardIds = cardsWithOverall.map((c) => c.id);

  // ── 3. Historical comparison (for change calculation) ───────────────────────
  const cutoff = new Date(Date.now() - (PERIOD_MS[period] ?? PERIOD_MS["7d"]));

  const oldSnapshots = await prisma.cardRatingSnapshot.findMany({
    where: { cardId: { in: cardIds }, snapshotAt: { lte: cutoff } },
    orderBy: { snapshotAt: "desc" },
    select: { cardId: true, overall: true },
  });

  const oldOverallMap = new Map<string, number>();
  for (const snap of oldSnapshots) {
    if (!oldOverallMap.has(snap.cardId)) {
      oldOverallMap.set(snap.cardId, Math.round(snap.overall));
    }
  }

  // ── 4. Sparkline data (last 7 snapshots grouped by day) ────────────────────
  type SparkRow = { cardId: string; day: string; overall: number };
  const sparkRows = await prisma.$queryRaw<SparkRow[]>`
    SELECT DISTINCT ON ("cardId", DATE("snapshotAt"))
      "cardId",
      DATE("snapshotAt")::text AS day,
      overall
    FROM "CardRatingSnapshot"
    WHERE "cardId" = ANY(${cardIds}::text[])
      AND "snapshotAt" >= NOW() - INTERVAL '7 days'
    ORDER BY "cardId", DATE("snapshotAt") ASC, "snapshotAt" DESC
  `;

  const sparklineMap = new Map<string, number[]>();
  for (const row of sparkRows) {
    const arr = sparklineMap.get(row.cardId) ?? [];
    arr.push(Math.round(row.overall));
    sparklineMap.set(row.cardId, arr);
  }

  // ── 5. Assemble result ──────────────────────────────────────────────────────
  const result = cardsWithOverall.map((card) => {
    const oldOverall = oldOverallMap.get(card.id);
    const change = oldOverall != null ? card.overall - oldOverall : 0;
    const sparkline = sparklineMap.get(card.id) ?? [card.overall];
    return { ...card, change, sparkline };
  });

  // ── 6. Sort ─────────────────────────────────────────────────────────────────
  let sorted: typeof result;
  switch (sort) {
    case "risers":
      sorted = result.filter((c) => c.change > 0).sort((a, b) => b.change - a.change);
      break;
    case "fallers":
      sorted = result.filter((c) => c.change < 0).sort((a, b) => a.change - b.change);
      break;
    case "votes":
      sorted = [...result].sort((a, b) => b.voteCount - a.voteCount);
      break;
    default:
      sorted = [...result].sort((a, b) => b.overall - a.overall);
  }

  return NextResponse.json({ cards: sorted.slice(0, 50) });
}
