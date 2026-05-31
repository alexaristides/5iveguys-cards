import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pusher } from "@/lib/pusher";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const lobby = await prisma.lobby.findUnique({ where: { id } });

  if (!lobby) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (lobby.creatorId === session.user.id) return NextResponse.json({ error: "Cannot join your own lobby" }, { status: 400 });
  if (lobby.status !== "WAITING") return NextResponse.json({ error: "Lobby is not open" }, { status: 409 });
  if (new Date() > lobby.expiresAt) return NextResponse.json({ error: "Lobby expired" }, { status: 410 });

  const updated = await prisma.lobby.update({
    where: { id },
    data: { opponentId: session.user.id, status: "ACTIVE" },
    include: {
      creator: { select: { id: true, name: true, image: true } },
      opponent: { select: { id: true, name: true, image: true } },
      matchResult: true,
    },
  });

  await pusher.trigger(`lobby-${id}`, "lobby:joined", {
    opponent: updated.opponent,
  });

  return NextResponse.json({ lobby: updated });
}
