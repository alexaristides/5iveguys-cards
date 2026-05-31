import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Count wins / losses / draws per user
  const [wins, losses, draws] = await Promise.all([
    prisma.footballMatch.groupBy({
      by: ["userId"],
      where: { result: "win" },
      _count: { _all: true },
    }),
    prisma.footballMatch.groupBy({
      by: ["userId"],
      where: { result: "loss" },
      _count: { _all: true },
    }),
    prisma.footballMatch.groupBy({
      by: ["userId"],
      where: { result: "draw" },
      _count: { _all: true },
    }),
  ]);

  // Build a unified map
  const map = new Map<string, { wins: number; losses: number; draws: number }>();
  for (const r of wins)   { const e = map.get(r.userId) ?? { wins: 0, losses: 0, draws: 0 }; e.wins   = r._count._all; map.set(r.userId, e); }
  for (const r of losses) { const e = map.get(r.userId) ?? { wins: 0, losses: 0, draws: 0 }; e.losses = r._count._all; map.set(r.userId, e); }
  for (const r of draws)  { const e = map.get(r.userId) ?? { wins: 0, losses: 0, draws: 0 }; e.draws  = r._count._all; map.set(r.userId, e); }

  // Sort: wins desc, then draws desc, then fewest losses
  const ranked = [...map.entries()]
    .map(([userId, s]) => ({ userId, ...s, played: s.wins + s.losses + s.draws }))
    .filter(e => e.played > 0)
    .sort((a, b) => b.wins - a.wins || b.draws - a.draws || a.losses - b.losses)
    .slice(0, 15);

  if (ranked.length === 0) return NextResponse.json({ leaderboard: [], currentUserRank: null });

  const userIds = ranked.map(r => r.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, image: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));

  const currentUserRank = ranked.findIndex(r => r.userId === session.user!.id) + 1;

  return NextResponse.json({
    leaderboard: ranked.map((r, i) => {
      const u = userMap.get(r.userId);
      return {
        rank: i + 1,
        id: r.userId,
        name: u?.name ?? "Unknown",
        image: u?.image ?? null,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
        played: r.played,
        isCurrentUser: r.userId === session.user!.id,
      };
    }),
    currentUserRank: currentUserRank || null,
  });
}
