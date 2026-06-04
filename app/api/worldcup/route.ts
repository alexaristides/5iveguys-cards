import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { nanoid } from "nanoid";
import { createTournament } from "@/lib/worldcup/tournament";
import { lineupOverallFromSlots } from "@/lib/worldcup/server";
import type { SavedSlot } from "@/lib/worldcup/types";
import type { Formation } from "@/lib/football";

// GET — the user's active tournament (for resume), or null.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const wc = await prisma.worldCup.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ worldCup: wc ?? null });
}

// POST — start a new tournament. Body: { lineup: SavedSlot[], formation, difficulty }.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.worldCup.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
  });
  if (existing) return NextResponse.json({ error: "Tournament already in progress", worldCup: existing }, { status: 409 });

  const body = await req.json().catch(() => null) as
    | { lineup?: SavedSlot[]; formation?: Formation; difficulty?: "easy" | "even" | "hard" } | null;
  if (!body?.lineup || !body.formation) {
    return NextResponse.json({ error: "Missing lineup or formation" }, { status: 400 });
  }

  const built = await lineupOverallFromSlots(session.user.id, body.lineup);
  if (!built) return NextResponse.json({ error: "Invalid lineup — you must own all 7 players" }, { status: 400 });

  const seed = nanoid();
  const state = createTournament({
    seed,
    difficulty: body.difficulty ?? "even",
    userName: session.user.name?.trim() || "Your Team",
    userOverall: built.overall,
    userFlag: session.user.image ?? null,
    userLineup: body.lineup,
    userFormation: body.formation,
  });

  const wc = await prisma.worldCup.create({
    data: {
      userId: session.user.id,
      status: "ACTIVE",
      difficulty: state.difficulty,
      seed,
      // Prisma Json column — cast through unknown to satisfy the typed input.
      state: state as unknown as object,
    },
  });
  return NextResponse.json({ worldCup: wc });
}

// DELETE — abandon the active tournament so a fresh one can start.
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.worldCup.updateMany({
    where: { userId: session.user.id, status: "ACTIVE" },
    data: { status: "ABANDONED" },
  });
  return NextResponse.json({ ok: true });
}
