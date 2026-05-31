import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pusher } from "@/lib/pusher";
import type { MatchEvent } from "@/lib/football";

interface TickBody {
  eventIndex: number;
  event: MatchEvent;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const lobby = await prisma.lobby.findUnique({ where: { id }, select: { creatorId: true, status: true } });
  if (!lobby) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (lobby.creatorId !== session.user.id) return NextResponse.json({ error: "Only creator drives ticks" }, { status: 403 });

  const { eventIndex, event } = await req.json() as TickBody;

  // Route to the appropriate Pusher event by type
  const pusherEvent =
    event.type === "halftime" ? "match:halftime" :
    event.type === "fulltime" ? "match:fulltime" :
    "match:tick";

  await pusher.trigger(`presence-lobby-${id}`, pusherEvent, { eventIndex, event });

  return NextResponse.json({ ok: true });
}
