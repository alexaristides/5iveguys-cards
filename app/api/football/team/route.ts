import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const saved = await prisma.savedFootballTeam.findUnique({
    where: { userId: session.user.id },
  });

  if (!saved) return NextResponse.json({ team: null });
  return NextResponse.json({ team: { formation: saved.formation, slots: saved.slotData } });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { formation, slots } = await req.json();

  await prisma.savedFootballTeam.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, formation, slotData: slots },
    update: { formation, slotData: slots },
  });

  return NextResponse.json({ ok: true });
}
