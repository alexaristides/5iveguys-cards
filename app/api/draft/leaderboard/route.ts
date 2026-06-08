import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

const PLACEMENT_RANK: Record<string, number> = {
  Champions: 6,
  "Runners-up": 5,
  "Semi-finals": 4,
  "Quarter-finals": 3,
  "Round of 16": 2,
  "Group stage": 1,
};

type Sort = "result" | "wins" | "goals" | "rating";

const ORDER_BY: Record<Sort, Prisma.DraftEntryOrderByWithRelationInput[]> = {
  result: [{ placementRank: "desc" }, { goalsFor: "desc" }, { teamRating: "desc" }],
  wins: [{ wins: "desc" }, { goalsFor: "desc" }, { placementRank: "desc" }],
  goals: [{ goalsFor: "desc" }, { wins: "desc" }],
  rating: [{ teamRating: "desc" }, { placementRank: "desc" }],
};

export async function GET(req: NextRequest) {
  const rawSort = req.nextUrl.searchParams.get("sort") ?? "result";
  const sort: Sort = (["result", "wins", "goals", "rating"] as const).includes(rawSort as Sort)
    ? (rawSort as Sort)
    : "result";

  const entries = await prisma.draftEntry.findMany({
    orderBy: ORDER_BY[sort],
    take: 50,
    select: {
      id: true, alias: true, formation: true, teamRating: true, placement: true,
      won: true, wins: true, draws: true, losses: true, goalsFor: true,
      goalsAgainst: true, difficulty: true, ratingsMode: true, createdAt: true,
      squad: true,
    },
  });

  return NextResponse.json({ entries });
}

function clampInt(v: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof v === "number" ? Math.round(v) : Number.parseInt(String(v), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const placement = String(body.placement ?? "Group stage");
  if (!(placement in PLACEMENT_RANK)) {
    return NextResponse.json({ error: "Invalid placement" }, { status: 400 });
  }

  const alias = String(body.alias ?? "Anonymous").trim().slice(0, 24) || "Anonymous";
  const formation = String(body.formation ?? "4-3-3").slice(0, 12);
  const difficulty = ["easy", "normal", "hard"].includes(String(body.difficulty))
    ? String(body.difficulty)
    : "normal";
  const ratingsMode = ["current", "peak"].includes(String(body.ratingsMode))
    ? String(body.ratingsMode)
    : "current";

  // Attach userId if the player is signed in, but never require it.
  const session = await getServerSession(authOptions).catch(() => null);

  const entry = await prisma.draftEntry.create({
    data: {
      alias,
      userId: session?.user?.id ?? null,
      formation,
      teamRating: clampInt(body.teamRating, 0, 99),
      placement,
      placementRank: PLACEMENT_RANK[placement],
      won: placement === "Champions",
      wins: clampInt(body.wins, 0, 7),
      draws: clampInt(body.draws, 0, 7),
      losses: clampInt(body.losses, 0, 7),
      goalsFor: clampInt(body.goalsFor, 0, 99),
      goalsAgainst: clampInt(body.goalsAgainst, 0, 99),
      difficulty,
      ratingsMode,
      squad: body.squad ? (body.squad as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: entry.id });
}
