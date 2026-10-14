import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { relayToken } from "@/lib/street-online";

/** 5IVE STREET online: who's playing, and what the game page needs to reach Pusher. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, teamName: true, image: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    user: { id: user.id, name: user.teamName ?? user.name ?? "Player", image: user.image },
    pusher: { key: process.env.NEXT_PUBLIC_PUSHER_KEY ?? process.env.PUSHER_KEY, cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? process.env.PUSHER_CLUSTER },
    relay: relayToken(user.id),
  });
}
