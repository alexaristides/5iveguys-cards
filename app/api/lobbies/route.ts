import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { nanoid } from "nanoid";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lobbies = await prisma.lobby.findMany({
    where: {
      status: "WAITING",
      expiresAt: { gt: new Date() },
      creatorId: { not: session.user.id },
    },
    include: { creator: { select: { id: true, name: true, image: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ lobbies });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const origin = req.headers.get("origin") ?? "";
  const lobbyId = nanoid(10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min expiry per spec

  const lobby = await prisma.lobby.create({
    data: { id: lobbyId, creatorId: session.user.id, status: "WAITING", expiresAt },
  });

  const inviteUrl = `${origin}/lobby/${lobbyId}`;
  return NextResponse.json({ lobbyId, inviteUrl, lobby });
}
