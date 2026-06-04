import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { advance, nextUserFixture } from "@/lib/worldcup/tournament";
import type { TournamentState, SavedSlot } from "@/lib/worldcup/types";
import type { Formation } from "@/lib/football";

interface Body {
  worldCupId: string;
  fixtureId: string;
  result: { userScore: number; cpuScore: number; userWon?: boolean; userPens?: number; cpuPens?: number };
  lineup?: SavedSlot[];
  formation?: Formation;
}

const okInt = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 30;

// POST — submit the user's played match result; advance the whole tournament.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as Body | null;
  if (!body?.worldCupId || !body.fixtureId || !body.result) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!okInt(body.result.userScore) || !okInt(body.result.cpuScore)) {
    return NextResponse.json({ error: "Invalid score" }, { status: 400 });
  }

  const wc = await prisma.worldCup.findFirst({
    where: { id: body.worldCupId, userId: session.user.id, status: "ACTIVE" },
  });
  if (!wc) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  const state = wc.state as unknown as TournamentState;
  const next = nextUserFixture(state);
  if (!next || next.id !== body.fixtureId) {
    // Out of sync (e.g. double submit) — just return current state.
    return NextResponse.json({ worldCup: wc, stale: true });
  }

  const newState = advance(state, body.fixtureId, body.result);
  // Carry the chosen lineup/formation forward as the default for the next game.
  if (body.lineup && body.formation) {
    newState.userLineup = body.lineup;
    newState.userFormation = body.formation;
  }

  const finished = newState.stage === "done";
  const updated = await prisma.worldCup.update({
    where: { id: wc.id },
    data: {
      state: newState as unknown as object,
      status: finished ? "FINISHED" : "ACTIVE",
      champion: finished ? newState.champion : null,
      placement: finished ? newState.userPlacement : null,
    },
  });
  return NextResponse.json({ worldCup: updated });
}
