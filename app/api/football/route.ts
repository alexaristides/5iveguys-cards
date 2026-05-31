import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const where = { userId: session.user.id };

  const [wins, losses, draws] = await Promise.all([
    prisma.footballMatch.count({ where: { ...where, result: "win" } }),
    prisma.footballMatch.count({ where: { ...where, result: "loss" } }),
    prisma.footballMatch.count({ where: { ...where, result: "draw" } }),
  ]);

  const recent = await prisma.footballMatch.findMany({
    where,
    orderBy: { playedAt: "desc" },
    take: 5,
    select: { id: true, userScore: true, cpuScore: true, result: true, playedAt: true, formation: true },
  });

  return NextResponse.json({ wins, losses, draws, recent });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { userCardIds, cpuCardIds, formation, userScore, cpuScore, result } = body;

  if (!["win", "loss", "draw"].includes(result)) {
    return NextResponse.json({ error: "Invalid result" }, { status: 400 });
  }

  const match = await prisma.footballMatch.create({
    data: {
      userId: session.user.id,
      channelId: null,
      userCardIds: userCardIds ?? [],
      cpuCardIds: cpuCardIds ?? [],
      formation,
      userScore,
      cpuScore,
      result,
    },
  });

  return NextResponse.json({ id: match.id });
}
