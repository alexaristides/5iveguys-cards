import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const channelSlug = req.nextUrl.searchParams.get("channelSlug");
  const channel = channelSlug
    ? await prisma.channel.findUnique({ where: { slug: channelSlug } })
    : null;

  const saved = await prisma.savedFootballTeam.findUnique({
    where: { userId_channelId: { userId: session.user.id, channelId: channel?.id ?? "" } },
  });

  if (!saved) return NextResponse.json({ team: null });
  return NextResponse.json({ team: { formation: saved.formation, slots: saved.slotData } });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { channelSlug, formation, slots } = await req.json();

  const channel = channelSlug
    ? await prisma.channel.findUnique({ where: { slug: channelSlug } })
    : null;

  await prisma.savedFootballTeam.upsert({
    where: { userId_channelId: { userId: session.user.id, channelId: channel?.id ?? "" } },
    create: { userId: session.user.id, channelId: channel?.id ?? null, formation, slotData: slots },
    update: { formation, slotData: slots },
  });

  return NextResponse.json({ ok: true });
}
